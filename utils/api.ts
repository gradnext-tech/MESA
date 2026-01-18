/**
 * Get the basePath from the current URL
 * Returns the basePath (e.g., "/mesadashboard") or empty string if none
 */
function getBasePath(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  
  const currentPath = window.location.pathname;
  const knownRoutes = ['mentor-dashboard', 'student-dashboard', 'weekwise-sessions', 'login'];
  
  if (currentPath && currentPath !== '/') {
    const pathParts = currentPath.split('/').filter(Boolean);
    
    if (pathParts.length > 0) {
      const firstSegment = pathParts[0];
      
      // If the first segment is NOT a known route, it's likely the basePath
      if (!knownRoutes.includes(firstSegment)) {
        return '/' + firstSegment;
      }
    }
  }
  
  return '';
}

/**
 * Get the API URL that works from any route, regardless of basePath
 * 
 * Detects the basePath from the current URL and constructs the correct API path.
 * This ensures API calls work correctly when basePath is configured.
 * 
 * Examples:
 * - If basePath="/mesadashboard" and path="api/sheets"
 *   -> Returns "/mesadashboard/api/sheets"
 * - If no basePath and path="api/sheets"
 *   -> Returns "/api/sheets"
 */
export function getApiUrl(path: string): string {
  if (typeof window === 'undefined') {
    // Server-side: return as-is (Next.js handles basePath on server)
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return cleanPath;
  }
  
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Get basePath from Next.js config or detect from current URL
  // In development with basePath, Next.js serves the app at the basePath
  let basePath = '';
  
  // Try to get basePath from the current pathname
  const currentPath = window.location.pathname;
  if (currentPath.startsWith('/mesadashboard')) {
    basePath = '/mesadashboard';
  } else {
    // Fallback: detect from URL structure
    basePath = getBasePath();
  }
  
  // Construct the full path with basePath
  const fullPath = basePath + '/' + cleanPath;
  return fullPath;
}

/**
 * Get the route URL for Next.js Link components and router.push()
 * 
 * Next.js automatically handles basePath for both Link components and router.push().
 * We just normalize the path format - Next.js will automatically prepend basePath.
 * 
 * IMPORTANT: Next.js Link and router.push() automatically handle basePath,
 * so we should NOT manually add it. Just return the path in the correct format.
 * 
 * Examples:
 * - path="mentor-dashboard" -> Returns "/mentor-dashboard"
 * - path="./" -> Returns "/"
 * - path="/mentor-dashboard" -> Returns "/mentor-dashboard"
 */
export function getRouteUrl(path: string): string {
  // Handle relative paths that should go to home
  if (path === './' || path === '.' || path === '') {
    return '/';
  }
  
  // If path already starts with "/", return as-is (Next.js handles basePath)
  if (path.startsWith('/')) {
    return path;
  }
  
  // Add leading slash for relative paths (Next.js will handle basePath automatically)
  return '/' + path;
}
