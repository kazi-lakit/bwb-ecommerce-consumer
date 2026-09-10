import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { completeLogin } from "@/lib/blocks/auth";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "@/lib/toast-store";
import { Spinner } from "@/components/ui/spinner";

const MESSAGES: Record<string, string> = { callback_failed: "We couldn't complete sign-in. Please try again." };

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const ranOnce = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Strict Mode runs effects twice in development. IAM state is single-use, so the
    // second callback would otherwise fail after the first one has succeeded.
    if (ranOnce.current) return;
    ranOnce.current = true;

    void (async () => {
      try {
        const result = await completeLogin(window.location.href);
        if (!result.ok) {
          toast.error(MESSAGES.callback_failed);
          setFailed(true);
          return;
        }
        await refresh();
        navigate(result.returnTo, { replace: true });
      } catch {
        toast.error(MESSAGES.callback_failed);
        setFailed(true);
      }
    })();
  }, [navigate, refresh]);

  // No standalone /login page to bounce a failure to — land back on the public
  // storefront; the toast above explains what happened, and "Staff sign in" is right there.
  if (failed) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
