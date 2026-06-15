export function getUserIdFromRequest(request) {
  try {
    const authCookie = request.cookies.get('auth-token');

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
