import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type UIContextValue = {
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
};

const UIContext = createContext<UIContextValue | null>(null);

type UIProviderProps = {
  children: ReactNode;
  /** Optional listener fired whenever the login modal opens (used for analytics-free notices). */
  onLoginOpen?: () => void;
};

export function UIProvider({ children, onLoginOpen }: UIProviderProps) {
  const [loginOpen, setLoginOpen] = useState(false);

  const openLogin = useCallback(() => {
    setLoginOpen(true);
    onLoginOpen?.();
  }, [onLoginOpen]);

  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const value = useMemo<UIContextValue>(
    () => ({ loginOpen, openLogin, closeLogin }),
    [loginOpen, openLogin, closeLogin],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used inside a <UIProvider>");
  }
  return context;
}
