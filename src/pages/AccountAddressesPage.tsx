import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useCommerceCustomer } from "@/components/providers/commerce-customer-provider";
import { COMMERCE_SCHEMAS_LIVE, formatAddress, type CommerceAddress } from "@/lib/blocks/commerce";
import { AccountLayout } from "@/components/storefront/account-layout";
import { EmptyNotice } from "@/pages/AccountOrdersPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast-store";
import { usePageMeta } from "@/lib/seo";

const BLANK: CommerceAddress = { Line1: "", City: "", PostalCode: "" };

export default function AccountAddressesPage() {
  usePageMeta({ title: "Your addresses — Cartio", noIndex: true });
  const { customer, saveAddress, removeAddress } = useCommerceCustomer();
  const [draft, setDraft] = useState<CommerceAddress>(BLANK);
  const [busy, setBusy] = useState(false);

  const addresses = customer?.addresses ?? [];

  async function add() {
    if (!draft.Line1.trim() || !draft.City.trim()) {
      toast.error("Please fill in at least the street and city.");
      return;
    }
    setBusy(true);
    try {
      await saveAddress({
        Line1: draft.Line1.trim(),
        Line2: draft.Line2?.trim() || undefined,
        City: draft.City.trim(),
        State: draft.State?.trim() || undefined,
        PostalCode: draft.PostalCode.trim(),
        CountryCode: draft.CountryCode?.trim() || undefined,
      });
      setDraft(BLANK);
      toast.success("Address saved.");
    } catch {
      // blocksDataCall already surfaced the specific error.
    } finally {
      setBusy(false);
    }
  }

  async function remove(index: number) {
    setBusy(true);
    try {
      await removeAddress(index);
      toast.success("Address removed.");
    } catch {
      // as above
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountLayout title="Your addresses">
      {!COMMERCE_SCHEMAS_LIVE ? (
        <EmptyNotice
          title="Saved addresses aren't available yet"
          body="Your profile isn't being stored on the server yet. Checkout still works — you'll just type your address each time."
        />
      ) : (
        <div className="space-y-6">
          {addresses.length === 0 ? (
            <EmptyNotice title="No saved addresses" body="Add one below, or tick “save this address” at checkout." />
          ) : (
            <ul className="space-y-2">
              {addresses.map((address, i) => (
                <li key={`${address.Line1}-${i}`} className="flex items-start justify-between gap-3 rounded-md border border-hairline p-3">
                  <span className="text-sm text-ink">{formatAddress(address)}</span>
                  <button
                    type="button"
                    aria-label="Remove address"
                    disabled={busy}
                    onClick={() => void remove(i)}
                    className="flex-none text-muted hover:text-brand-error disabled:opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <section className="rounded-md border border-hairline p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Add an address</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                placeholder="Street address"
                value={draft.Line1}
                onChange={(e) => setDraft((d) => ({ ...d, Line1: e.target.value }))}
                className="sm:col-span-2"
              />
              <Input
                placeholder="Apartment, suite (optional)"
                value={draft.Line2 ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, Line2: e.target.value }))}
                className="sm:col-span-2"
              />
              <Input placeholder="City" value={draft.City} onChange={(e) => setDraft((d) => ({ ...d, City: e.target.value }))} />
              <Input placeholder="State / region" value={draft.State ?? ""} onChange={(e) => setDraft((d) => ({ ...d, State: e.target.value }))} />
              <Input placeholder="Postal code" value={draft.PostalCode} onChange={(e) => setDraft((d) => ({ ...d, PostalCode: e.target.value }))} />
              <Input placeholder="Country code" value={draft.CountryCode ?? ""} onChange={(e) => setDraft((d) => ({ ...d, CountryCode: e.target.value }))} />
            </div>
            <Button className="mt-3" size="sm" disabled={busy || !customer} onClick={() => void add()}>
              Save address
            </Button>
            {!customer && (
              <p className="mt-2 text-xs text-muted">Your profile is still loading — try again in a moment.</p>
            )}
          </section>
        </div>
      )}
    </AccountLayout>
  );
}
