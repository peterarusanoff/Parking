// Shared types and utilities

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export const ok = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
});

export const err = <E extends Error>(error: E): Result<never, E> => ({
  success: false,
  error,
});

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const successResponse = <T>(
  data: T,
  message?: string
): ApiResponse<T> => ({
  success: true,
  data,
  ...(message && { message }),
});

export const errorResponse = (error: string): ApiResponse<never> => ({
  success: false,
  error,
});

