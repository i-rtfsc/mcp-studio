import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Truncate base64 data in objects for display purposes.
 * Replaces long base64 strings with a placeholder showing the size.
 */
export function truncateBase64InObject(obj: unknown): unknown {
  if (!obj) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(truncateBase64InObject);
  }

  const newObj = { ...(obj as Record<string, unknown>) };

  // Check if this object looks like an image content block
  if (
    newObj.type === 'image' &&
    typeof newObj.data === 'string' &&
    (newObj.data as string).length > 100
  ) {
    newObj.data = `... (${Math.round((newObj.data as string).length / 1024)} KB base64 data) ...`;
  } else {
    // Recursively process other fields
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = truncateBase64InObject(newObj[key]);
      }
    }
  }

  return newObj;
}
