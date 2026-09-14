import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Heart, Mail, PackageCheck, ShieldCheck } from "lucide-react";
import { blocksClient } from "@/lib/blocks/client";
import { startLogin } from "@/lib/blocks/auth";
import { CartioAnimatedLogo } from "@/components/storefront/cartio-animated-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  async function sendInvitation() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }

    setEmail(trimmed);
    setFieldError("");
    setFormError("");
    setBusy(true);
    try {
      const availability = (await blocksClient.iam.users.emailAvailable({ email: trimmed })) as Record<string, unknown>;
      if (availability.isAvailable === false || availability.IsAvailable === false) {
        const message = "An account with this email already exists. Sign in to continue.";
        setFormError(message);
        toast.error(message);
        return;
      }

      const signupResult = await blocksClient.auth.signup({
        email: trimmed,
        password: randomPassword(),
        firstName: "",
        lastName: "",
      });
      if (failed(signupResult)) {
        const message = extractMessage(signupResult) ?? "We couldn't create that account. Please try again.";
        setFormError(message);
        toast.error(message);
        return;
      }

      // Puts the account's own password in the visitor's hands via IAM's emailed reset link,
      // rather than one this page generated and threw away.
      await blocksClient.auth.recover({ email: trimmed });

      setSent(true);
    } catch {
      const message = "Something went wrong sending your secure link. Please try again.";
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-hairline bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Cartio home" className="inline-flex items-center">
            <CartioAnimatedLogo className="h-9" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <span className="hidden text-sm text-steel sm:inline">Already have an account?</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void startLogin("/account/orders")}>
              Sign in
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1440px] lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)]">
        <aside className="relative hidden overflow-hidden bg-surface-dark px-12 py-14 text-on-dark lg:flex lg:flex-col xl:px-20 xl:py-20">
          <div aria-hidden="true" className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -right-8 top-8 h-48 w-48 rounded-full bg-brand-accent/15 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full border border-white/5" />

          <div className="relative z-10 max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-accent">The Cartio advantage</p>
            <h2 className="mt-5 font-display text-4xl leading-[1.08] xl:text-5xl">
              Everything you love,<br />all in one place.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/65">
              Create a private account to move seamlessly from inspiration to delivery, with every detail kept together.
            </p>
          </div>

          <div className="relative z-10 mt-12 space-y-3">
            {[
              { icon: PackageCheck, title: "Track every order", copy: "View delivery progress and purchase history." },
              { icon: Heart, title: "Keep your favourites", copy: "Save considered pieces and return anytime." },
              { icon: ShieldCheck, title: "Check out with confidence", copy: "Your account is protected by secure sign-in." },
            ].map(({ icon: Icon, title, copy }) => (
              <div key={title} className="flex items-start gap-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-accent/15 text-brand-accent">
                  <Icon size={19} strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-white/55">{copy}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-auto flex items-center gap-3 pt-12 text-xs leading-5 text-white/50">
            <ShieldCheck size={16} className="flex-none text-brand-accent" />
            <span>Your password is created through a private setup link sent to your email.</span>
          </div>
        </aside>

        <section className="flex items-center justify-center px-4 py-12 sm:px-8 sm:py-16 lg:px-14 xl:px-24">
          <div className="w-full max-w-[480px]">
            {sent ? (
              <div className="text-center" aria-live="polite">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand-accent/20 bg-brand-accent-soft text-brand-accent">
                  <Mail size={27} strokeWidth={1.8} />
                </div>
                <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-brand-accent">Invitation sent</p>
                <h1 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">Check your inbox</h1>
                <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-steel">
                  We sent a secure account setup link to <span className="font-semibold text-ink">{email}</span>.
                  Open it to choose your password and complete your account.
                </p>

                <div className="mt-8 rounded-md border border-hairline bg-surface-soft p-5 text-left">
                  <p className="text-sm font-semibold text-ink">What happens next</p>
                  <ol className="mt-4 space-y-3">
                    {["Open the email from Cartio", "Choose a secure password", "Sign in and start shopping"].map((step, index) => (
                      <li key={step} className="flex items-center gap-3 text-sm text-steel">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-accent text-[11px] font-semibold text-on-primary">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setSent(false);
                      setFormError("");
                      requestAnimationFrame(() => emailRef.current?.focus());
                    }}
                  >
                    Use another email
                  </Button>
                  <Link
                    to="/"
                    className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand-accent px-7 py-3.5 text-sm font-semibold leading-tight text-on-primary shadow-[0_8px_20px_rgba(234,88,12,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-accent-deep"
                  >
                    Back to shopping
                  </Link>
                </div>

                <p className="mt-6 text-xs leading-5 text-muted">
                  No email yet? Check your spam folder or use another email address.
                </p>
              </div>
            ) : (
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-steel shadow-sm">
                  <ShieldCheck size={14} className="text-brand-accent" />
                  Secure account setup
                </div>
                <h1 className="mt-6 font-display text-3xl leading-tight text-ink sm:text-4xl">Create your Cartio account</h1>
                <p className="mt-4 max-w-md text-sm leading-6 text-steel">
                  Enter your email and we’ll send a secure link to create your password. No password is entered on this page.
                </p>

                <form
                  className="mt-8"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendInvitation();
                  }}
                >
                  <label htmlFor="account-email" className="text-sm font-semibold text-ink">
                    Work or personal email
                  </label>
                  <div className="relative mt-2">
                    <Mail
                      size={18}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <Input
                      ref={emailRef}
                      id="account-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="name@company.com"
                      value={email}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? "account-email-error" : "account-email-help"}
                      onBlur={() => {
                        if (email.trim() && !EMAIL_RE.test(email.trim())) setFieldError("Enter a valid email address.");
                      }}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (fieldError) setFieldError("");
                        if (formError) setFormError("");
                      }}
                      disabled={busy}
                      className={fieldError ? "border-brand-error pl-12 focus:border-brand-error" : "pl-12"}
                    />
                  </div>
                  {fieldError ? (
                    <p id="account-email-error" role="alert" className="mt-2 text-xs font-medium text-brand-error">
                      {fieldError}
                    </p>
                  ) : (
                    <p id="account-email-help" className="mt-2 text-xs leading-5 text-muted">
                      We use this address for account access and order updates.
                    </p>
                  )}

                  {formError && (
                    <div role="alert" className="mt-5 rounded-sm border border-brand-error/25 bg-brand-error/10 px-4 py-3 text-sm leading-5 text-brand-error">
                      {formError}
                    </div>
                  )}

                  <Button type="submit" className="mt-6 w-full" disabled={busy}>
                    {busy ? (
                      <>
                        <Spinner className="h-5 w-5" />
                        Sending secure link…
                      </>
                    ) : (
                      <>
                        Continue with email
                        <ArrowRight size={17} />
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-7 flex items-start gap-3 border-t border-hairline pt-6">
                  <ShieldCheck size={17} className="mt-0.5 flex-none text-brand-accent" />
                  <p className="text-xs leading-5 text-muted">
                    For your security, don’t share the setup link. Your password is created only after you open it.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void startLogin("/account/orders")}
                  className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-brand-accent sm:hidden"
                >
                  Already registered? Sign in
                </button>
              </div>
            )}

            <Link to="/" className="mt-10 inline-flex items-center gap-2 text-xs font-medium text-muted transition-colors hover:text-ink">
              <ArrowLeft size={14} />
              Return to store
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
