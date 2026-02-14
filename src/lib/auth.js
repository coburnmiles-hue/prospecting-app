import { cookies } from 'next/headers';

export async function getUserIdFromRequest(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth-token');
    
    if (!authCookie?.value) {
      return null;
    }
    
    const userId = parseInt(authCookie.value, 10);
    return isNaN(userId) ? null : userId;
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
}
