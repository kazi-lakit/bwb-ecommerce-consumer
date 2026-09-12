import { useAuth } from "./auth-provider";
import { startLogin } from "@/lib/blocks/auth";
import { StorefrontHeader } from "@/components/storefront/storefront-header";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Gates a route behind a signed-in session.
 *
 * Deliberately shows a sign-in prompt rather than redirecting straight into the hosted SSO
 * flow the way the backoffice does: this is a public storefront, and someone who lands on an
 * account link from a bookmark or a shared URL should be told where they are before being
 * bounced to an identity provider. `returnTo` brings them back to the page they wanted.
 *
 * This is a convenience, not the security boundary — `Order`'s row-level policy restricts
 * reads to the customer's own records regardless of what the client does.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <div className="flex justify-center py-24">
          <Spinner className="h-6 w-6" />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return (
      <div className="min-h-screen bg-canvas">
        <StorefrontHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-xl text-ink">Sign in to view your account</h1>
          <p className="mt-2 text-sm text-muted">Your orders and saved addresses live here.</p>
          <Button className="mt-5" onClick={() => void startLogin(returnTo)}>
            Log in / Create an Account
          </Button>
        </div>
        <StorefrontFooter />
      </div>
    );
  }

  return <>{children}</>;
}
