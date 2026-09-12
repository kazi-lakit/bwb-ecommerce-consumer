import { useAuth } from "@/components/providers/auth-provider";
import { useCommerceCustomer } from "@/components/providers/commerce-customer-provider";
import { AccountLayout } from "@/components/storefront/account-layout";
import { Button } from "@/components/ui/button";

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between border-b border-hairline-soft py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value || "—"}</span>
    </div>
  );
}

export default function AccountProfilePage() {
  const { user, logout } = useAuth();
  const { customer } = useCommerceCustomer();

  return (
    <AccountLayout title="Your profile">
      <div className="rounded-md border border-hairline px-4 py-2">
        <Field label="Name" value={[user?.firstName, user?.lastName].filter(Boolean).join(" ")} />
        <Field label="Email" value={user?.email} />
        <Field label="Phone" value={user?.phoneNumber ?? customer?.phone} />
        <Field label="Saved addresses" value={String(customer?.addresses.length ?? 0)} />
      </div>

      {/*
        Read-only on purpose. Name, email and phone live in IAM, which owns identity for every
        app in this project — editing them here would need the IAM user-update endpoint and a
        decision about which fields a customer may change about themselves. Not something to
        decide as a side effect of building an account page.
      */}
      <p className="mt-3 text-xs text-muted">
        These details come from your sign-in account. To change them, contact support.
      </p>

      <Button className="mt-5" size="sm" variant="secondary" onClick={() => void logout()}>
        Log out
      </Button>
    </AccountLayout>
  );
}
