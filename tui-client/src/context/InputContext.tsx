import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface InputContextType {
  isInputActive: boolean;
  setInputActive: (active: boolean) => void;
}

const InputContext = createContext<InputContextType | undefined>(undefined);

export function InputProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [isInputActive, setInputActive] = useState(false);

  return (
    <InputContext.Provider value={{ isInputActive, setInputActive }}>
      {children}
    </InputContext.Provider>
  );
}

export function useInputContext(): InputContextType {
  const context = useContext(InputContext);
  if (!context) {
    throw new Error('useInputContext must be used within an InputProvider');
  }
  return context;
}
