"use server";
import { IInitialState } from "@/lib/store/profile/profile.model";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { logger } from "./secureLogger";

export default async function getCurrentUserData() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      logger.debug('No active session found');
      return null;
    }

    logger.debug('User session retrieved', {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role
    });
    
    return session.user;
  } catch (error) {
    logger.error('Error getting current user data', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return null;
  }
}
