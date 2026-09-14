import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { blocksClient } from "@/lib/blocks/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast-store";
import { usePageMeta } from "@/lib/seo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A password nobody ever needs to know — the account is created, then immediately handed to
 * `auth.recover`, so the visitor sets their own password from the emailed reset link. Only
 * needs to satisfy IAM's password policy, not be memorable. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `Aa1!${btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x")}`;
}

function extractMessage(response: Record<string, unknown>): string | undefined {
  if (typeof response.message === "string" && response.message) return response.message;
  if (typeof response.error_description === "string" && response.error_description) return response.error_description;
  const errors = response.errors;
  if (Array.isArray(errors) && errors.length > 0) return String(errors[0]);
  if (errors && typeof errors === "object") return Object.values(errors as object).flat().map(String)[0];
  return undefined;
}

function failed(response: Record<string, unknown>): boolean {
  return response.isSuccess === false || response.error != null || (Array.isArray(response.errors) && response.errors.length > 0);
}

export default function CreateAccountPage() {
  usePageMeta({ title: "Create account — Cartio", noIndex: true });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendInvitation() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      toast.error("Enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      const availability = (await blocksClient.iam.users.emailAvailable({ email: trimmed })) as Record<string, unknown>;
      if (availability.isAvailable === false || availability.IsAvailable === false) {
        toast.error("An account with this email already exists. Try logging in instead.");
        return;
      }

      const signupResult = await blocksClient.auth.signup({
        email: trimmed,
        password: randomPassword(),
        firstName: "",
        lastName: "",
      });
      if (failed(signupResult)) {
        toast.error(extractMessage(signupResult) ?? "We couldn't create that account. Please try again.");
        return;
      }

      // Puts the account's own password in the visitor's hands via IAM's emailed reset link,
      // rather than one this page generated and threw away.
      await blocksClient.auth.recover({ email: trimmed });

      setSent(true);
    } catch {
      toast.error("Something went wrong sending your invitation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      {sent ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-hairline p-8 text-center">
          <Mail size={28} className="text-brand-accent" />
          <h1 className="font-display text-xl text-ink">Check your email</h1>
          <p className="text-sm text-steel">
            We sent an invitation to <span className="font-medium text-ink">{email.trim()}</span>. Follow the link
            inside to set a password and finish creating your account.
          </p>
          <Link to="/" className="mt-2 text-xs font-medium uppercase tracking-[0.05em] text-brand-accent hover:underline">
            Back to shopping
          </Link>
        </div>
      ) : (
        <div className="rounded-md border border-hairline p-8">
          <h1 className="font-display text-xl text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-steel">Enter your email and we'll send you an invitation to finish setting up your account.</p>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendInvitation();
            }}
          >
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
