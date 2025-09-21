/**
 * Security Monitoring Middleware
 * Tracks and logs security events for threat detection
 */

import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface SecurityEvent {
    timestamp: string;
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ip: string;
    userAgent: string;
    userId?: string;
    details: Record<string, any>;
    fingerprint?: string;
}

class SecurityMonitor {
    private logFile: string;
    private alertThresholds: Record<string, number>;
    private recentAttempts: Map<string, number[]>;
    private blockedIPs: Set<string>;

    constructor() {
        const rootDir = path.resolve(__dirname, '../../..');
        this.logFile = path.join(rootDir, 'logs/security-events.log');
        
        // Ensure log directory exists
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        this.alertThresholds = {
            FAILED_LOGIN: 5, // per 15 minutes
            BRUTE_FORCE: 10, // per hour
            SUSPICIOUS_REQUEST: 20, // per hour
            UNAUTHORIZED_ACCESS: 3 // per 15 minutes
        };

        this.recentAttempts = new Map();
        this.blockedIPs = new Set();
    }

    private generateFingerprint(req: Request): string {
        const components = [
            req.ip,
            req.get('User-Agent') || '',
            req.get('Accept-Language') || '',
            req.get('Accept-Encoding') || ''
        ];
        
        return crypto
            .createHash('sha256')
            .update(components.join('|'))
            .digest('hex')
            .substring(0, 16);
    }

    private logSecurityEvent(event: SecurityEvent): void {
        const logEntry = JSON.stringify(event) + '\n';
        
        try {
            fs.appendFileSync(this.logFile, logEntry);
            
            // Console log for critical events
            if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
                console.log(`🚨 SECURITY ALERT [${event.severity}]: ${event.type}`, event);
            }
        } catch (error) {
            console.error('Failed to log security event:', error);
        }
    }

    private isRateLimited(key: string, threshold: number, windowMinutes: number = 15): boolean {
        const now = Date.now();
        const windowMs = windowMinutes * 60 * 1000;
        
        if (!this.recentAttempts.has(key)) {
            this.recentAttempts.set(key, []);
        }
        
        const attempts = this.recentAttempts.get(key)!;
        
        // Remove old attempts outside the window
        const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
        this.recentAttempts.set(key, recentAttempts);
        
        // Add current attempt
        recentAttempts.push(now);
        
        return recentAttempts.length > threshold;
    }

    private detectBruteForce(ip: string): boolean {
        return this.isRateLimited(`brute_force:${ip}`, this.alertThresholds.BRUTE_FORCE, 60);
    }

    private detectSuspiciousPatterns(req: Request): string[] {
        const suspicious: string[] = [];
        
        // Check for common attack patterns in URL
        const url = req.originalUrl.toLowerCase();
        const suspiciousPatterns = [
            /\.\.(\/|\\)/,  // Directory traversal
            /<script/i,     // XSS attempts
            /union.*select/i, // SQL injection
            /base64_decode/i, // PHP injection
            /eval\(/i,      // Code injection
            /exec\(/i,      // Command injection
        ];
        
        suspiciousPatterns.forEach(pattern => {
            if (pattern.test(url)) {
                suspicious.push(`Suspicious URL pattern: ${pattern.source}`);
            }
        });
        
        // Check for suspicious headers
        const userAgent = req.get('User-Agent') || '';
        if (userAgent.length === 0 || userAgent.length > 500) {
            suspicious.push('Suspicious User-Agent');
        }
        
        // Check for common bot signatures
        const botPatterns = ['bot', 'crawler', 'spider', 'scraper'];
        if (botPatterns.some(pattern => userAgent.toLowerCase().includes(pattern))) {
            suspicious.push('Bot detected');
        }
        
        return suspicious;
    }

    public trackFailedLogin(req: Request, details: Record<string, any> = {}): void {
        const ip = req.ip;
        const fingerprint = this.generateFingerprint(req);
        
        // Check for rate limiting
        const isRateLimited = this.isRateLimited(
            `failed_login:${ip}`, 
            this.alertThresholds.FAILED_LOGIN
        );
        
        // Check for brute force
        const isBruteForce = this.detectBruteForce(ip);
        
        if (isBruteForce) {
            this.blockedIPs.add(ip);
        }
        
        this.logSecurityEvent({
            timestamp: new Date().toISOString(),
            type: 'FAILED_LOGIN',
            severity: isBruteForce ? 'CRITICAL' : isRateLimited ? 'HIGH' : 'MEDIUM',
            ip,
            userAgent: req.get('User-Agent') || '',
            fingerprint,
            details: {
                ...details,
                rateLimited: isRateLimited,
                bruteForce: isBruteForce,
                blockedIP: this.blockedIPs.has(ip)
            }
        });
    }

    public trackUnauthorizedAccess(req: Request, details: Record<string, any> = {}): void {
        const ip = req.ip;
        const fingerprint = this.generateFingerprint(req);
        
        const isRateLimited = this.isRateLimited(
            `unauthorized:${ip}`, 
            this.alertThresholds.UNAUTHORIZED_ACCESS
        );
        
        this.logSecurityEvent({
            timestamp: new Date().toISOString(),
            type: 'UNAUTHORIZED_ACCESS',
            severity: isRateLimited ? 'HIGH' : 'MEDIUM',
            ip,
            userAgent: req.get('User-Agent') || '',
            fingerprint,
            details: {
                ...details,
                path: req.originalUrl,
                method: req.method,
                rateLimited: isRateLimited
            }
        });
    }

    public trackSuspiciousRequest(req: Request, patterns: string[]): void {
        const ip = req.ip;
        const fingerprint = this.generateFingerprint(req);
        
        const isRateLimited = this.isRateLimited(
            `suspicious:${ip}`, 
            this.alertThresholds.SUSPICIOUS_REQUEST,
            60
        );
        
        this.logSecurityEvent({
            timestamp: new Date().toISOString(),
            type: 'SUSPICIOUS_REQUEST',
            severity: isRateLimited ? 'HIGH' : 'LOW',
            ip,
            userAgent: req.get('User-Agent') || '',
            fingerprint,
            details: {
                path: req.originalUrl,
                method: req.method,
                patterns,
                rateLimited: isRateLimited
            }
        });
    }

    public trackSuccessfulLogin(req: Request, userId: string): void {
        this.logSecurityEvent({
            timestamp: new Date().toISOString(),
            type: 'SUCCESSFUL_LOGIN',
            severity: 'LOW',
            ip: req.ip,
            userAgent: req.get('User-Agent') || '',
            userId,
            fingerprint: this.generateFingerprint(req),
            details: {
                loginTime: new Date().toISOString()
            }
        });
    }

    public isBlocked(ip: string): boolean {
        return this.blockedIPs.has(ip);
    }

    public unblockIP(ip: string): void {
        this.blockedIPs.delete(ip);
    }

    public getBlockedIPs(): string[] {
        return Array.from(this.blockedIPs);
    }

    // Middleware function
    public middleware() {
        return (req: Request, res: Response, next: NextFunction): void => {
            const ip = req.ip;
            
            // Check if IP is blocked
            if (this.isBlocked(ip)) {
                this.logSecurityEvent({
                    timestamp: new Date().toISOString(),
                    type: 'BLOCKED_REQUEST',
                    severity: 'MEDIUM',
                    ip,
                    userAgent: req.get('User-Agent') || '',
                    fingerprint: this.generateFingerprint(req),
                    details: {
                        path: req.originalUrl,
                        method: req.method,
                        reason: 'IP blocked due to suspicious activity'
                    }
                });
                
                res.status(429).json({
                    error: 'Too many requests',
                    message: 'Your IP has been temporarily blocked due to suspicious activity'
                });
                return;
            }
            
            // Check for suspicious patterns
            const suspiciousPatterns = this.detectSuspiciousPatterns(req);
            if (suspiciousPatterns.length > 0) {
                this.trackSuspiciousRequest(req, suspiciousPatterns);
            }
            
            next();
        };
    }
}

// Create singleton instance
const securityMonitor = new SecurityMonitor();

export { SecurityMonitor, securityMonitor };
