import { loginRoute } from "@/lib/api/login/login.route";
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { logger, logAuthEvent } from "@/utils/secureLogger";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            logAuthEvent('FAILED_LOGIN', { reason: 'Missing credentials' });
            return null;
          }

          const { email, password } = credentials;
          
          logAuthEvent('LOGIN_ATTEMPT', { email });
          
          const res = await loginRoute({ email, password });

          if (res.status === "error") {
            logAuthEvent('FAILED_LOGIN', { email, reason: res.message });
            throw new Error(res.message);
          } 
          
          if (res.status === "success") {
            const { data } = res;
            const { data: userInfo } = data;
            
            // Remove sensitive data before storing in session
            const { password: _, __v, ...sanitizedUserInfo } = userInfo;

            logAuthEvent('SUCCESSFUL_LOGIN', { 
              userId: sanitizedUserInfo._id,
              email: sanitizedUserInfo.email,
              role: sanitizedUserInfo.role 
            });

            return {
              id: sanitizedUserInfo._id,
              email: sanitizedUserInfo.email,
              name: `${sanitizedUserInfo.firstName} ${sanitizedUserInfo.lastName}`,
              role: sanitizedUserInfo.role,
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              ...sanitizedUserInfo,
            };
          }
          
          return null;
        } catch (error) {
          logAuthEvent('LOGIN_ERROR', { 
            email: credentials?.email,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      },
    }),
  ],
  
  session: {
    strategy: "jwt",
    maxAge: 15 * 60, // 15 minutes (short-lived for security)
    updateAge: 5 * 60, // 5 minutes (refresh session every 5 minutes)
  },
  
  jwt: {
    maxAge: 15 * 60, // 15 minutes
  },
  
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial sign in
      if (user) {
        token.user = user;
        token.accessToken = user.access_token;
        token.refreshToken = user.refresh_token;
      }
      
      // Session update
      if (trigger === "update" && session) {
        token.user = { ...token.user, ...session.user };
      }
      
      return token;
    },
    
    async session({ session, token }) {
      if (token.user) {
        session.user = {
          ...session.user,
          ...token.user,
          access_token: token.accessToken,
          refresh_token: token.refreshToken,
        };
      }
      
      return session;
    },
    
    async redirect({ url, baseUrl }) {
      logger.debug('Auth redirect', { url, baseUrl });
      
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      
      return baseUrl;
    },
  },
  
  events: {
    async signIn({ user, account, profile }) {
      logAuthEvent('SESSION_CREATED', { 
        userId: user.id,
        provider: account?.provider 
      });
    },
    
    async signOut({ token }) {
      logAuthEvent('SESSION_ENDED', { 
        userId: token?.user?.id 
      });
    },
    
    async session({ session, token }) {
      // Log session access for security monitoring
            logger.debug('Session accessed', { 
        tokenData: token ? 'present' : 'null',
        userData: session?.user ? 'present' : 'null'
      });
    },
  },
  
  secret: process.env.NEXTAUTH_SECRET,
  
  debug: process.env.NODE_ENV === 'development',
  
  // Security options
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 15 * 60, // 15 minutes
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production' ? '__Host-next-auth.csrf-token' : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
