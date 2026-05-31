"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  devEnabled: boolean;
  devBypass: boolean;
  toggleDevBypass: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  devEnabled: false,
  devBypass: false,
  toggleDevBypass: () => {},
});

// Routes a logged-out visitor is allowed to see (no redirect to /login).
const PUBLIC_ROUTES = ["/", "/login"];

// Dev-only auth bypass: never available in a production build.
const DEV_ENABLED = process.env.NODE_ENV !== "production";

// Stand-in for a Firebase user. Has no real UID/token, so authenticated
// Firestore reads and token-gated API calls will not work under it.
const MOCK_USER = {
  uid: "dev-user",
  email: "dev@lucra.local",
  displayName: "Dev User",
  photoURL: null,
  emailVerified: true,
  isAnonymous: false,
} as unknown as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [realUser, setRealUser] = useState<User | null>(null);
  const [devBypass, setDevBypass] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const user = realUser ?? (DEV_ENABLED && devBypass ? MOCK_USER : null);

  // localStorage is client-only; reading it in an effect (not render) is the
  // hydration-safe way to pick up the dev-auth bypass flag without an SSR mismatch.
  useEffect(() => {
    if (DEV_ENABLED && typeof window !== "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDevBypass(localStorage.getItem("lucra_dev_auth") === "1");
    }
  }, []);

  useEffect(() => {
    // Handle redirect result on page load (after Google redirect back)
    getRedirectResult(auth).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setRealUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user && !PUBLIC_ROUTES.includes(pathname)) {
      router.push("/login");
    }
    if (user && (pathname === "/login" || pathname === "/")) {
      router.push("/chat");
    }
  }, [user, loading, pathname, router]);

  function toggleDevBypass() {
    if (!DEV_ENABLED) return;
    setDevBypass((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        if (next) localStorage.setItem("lucra_dev_auth", "1");
        else localStorage.removeItem("lucra_dev_auth");
      }
      return next;
    });
  }

  async function signIn() {
    try {
      // Try popup first (works in most desktop browsers)
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      // Fall back to redirect if popup is blocked
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, googleProvider);
      } else {
        throw err;
      }
    }
  }

  async function signOut() {
    if (DEV_ENABLED && devBypass) {
      setDevBypass(false);
      if (typeof window !== "undefined") localStorage.removeItem("lucra_dev_auth");
    }
    await firebaseSignOut(auth);
    router.push("/login");
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signOut, devEnabled: DEV_ENABLED, devBypass, toggleDevBypass }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
