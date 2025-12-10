import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';

interface AppError {
  id: string;
  message: string;
  details?: string;
  timestamp: Date;
  dismissed: boolean;
}

interface ErrorContextType {
  errors: AppError[];
  addError: (message: string, details?: string) => void;
  dismissError: (id: string) => void;
  dismissAll: () => void;
  clearErrors: () => void;
  hasActiveErrors: boolean;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

let errorIdCounter = 0;

export function ErrorProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [errors, setErrors] = useState<AppError[]>([]);

  const addError = useCallback((message: string, details?: string) => {
    const newError: AppError = {
      id: `error-${++errorIdCounter}`,
      message,
      timestamp: new Date(),
      dismissed: false,
    };
    if (details) {
      newError.details = details;
    }
    setErrors((prev) => [...prev, newError]);
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrors((prev) =>
      prev.map((err) => (err.id === id ? { ...err, dismissed: true } : err))
    );
  }, []);

  const dismissAll = useCallback(() => {
    setErrors((prev) => prev.map((err) => ({ ...err, dismissed: true })));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const hasActiveErrors = errors.some((err) => !err.dismissed);

  return (
    <ErrorContext.Provider
      value={{ errors, addError, dismissError, dismissAll, clearErrors, hasActiveErrors }}
    >
      {children}
    </ErrorContext.Provider>
  );
}

export function useErrorContext(): ErrorContextType {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useErrorContext must be used within an ErrorProvider');
  }
  return context;
}

interface ErrorDisplayProps {
  maxVisible?: number;
}

export function ErrorDisplay({ maxVisible = 3 }: ErrorDisplayProps): React.ReactElement | null {
  const { errors, dismissError, dismissAll } = useErrorContext();
  const activeErrors = errors.filter((err) => !err.dismissed);

  useInput((input, key) => {
    if (activeErrors.length === 0) return;

    if (key.escape || input === 'd' || input === 'D') {
      // Dismiss the most recent error
      const lastError = activeErrors[activeErrors.length - 1];
      if (lastError) {
        dismissError(lastError.id);
      }
    }
    if (input === 'a' || input === 'A') {
      dismissAll();
    }
  });

  if (activeErrors.length === 0) {
    return null;
  }

  const visibleErrors = activeErrors.slice(-maxVisible);
  const hiddenCount = activeErrors.length - visibleErrors.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="red">
          Errors ({activeErrors.length})
        </Text>
        <Text color="gray">[D] Dismiss  [A] Dismiss All</Text>
      </Box>

      {hiddenCount > 0 && (
        <Text color="gray" dimColor>
          ... and {hiddenCount} more error{hiddenCount > 1 ? 's' : ''}
        </Text>
      )}

      {visibleErrors.map((error) => (
        <Box key={error.id} flexDirection="column" marginTop={1}>
          <Text color="red">{error.message}</Text>
          {error.details && (
            <Text color="gray" dimColor>
              {error.details}
            </Text>
          )}
          <Text color="gray" dimColor>
            {error.timestamp.toLocaleTimeString()}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export function useErrorHandler(): (error: unknown, context?: string) => void {
  const { addError } = useErrorContext();

  return useCallback(
    (error: unknown, context?: string) => {
      let message: string;
      let details: string | undefined;

      if (error instanceof Error) {
        message = error.message;
        details = context;
      } else if (typeof error === 'string') {
        message = error;
        details = context;
      } else {
        message = 'An unexpected error occurred';
        details = context ?? String(error);
      }

      if (context && !details) {
        details = context;
      }

      addError(message, details);
    },
    [addError]
  );
}
