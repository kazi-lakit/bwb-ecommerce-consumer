"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import {
  addCustomerAddress,
  COMMERCE_SCHEMAS_LIVE,
  ensureCommerceCustomer,
  setCustomerAddresses,
  type CommerceAddress,
  type CommerceCustomer,
} from "@/lib/blocks/commerce";

interface CommerceCustomerContextValue {
  /** `null` until the schema is live, the user isn't signed in, or the profile hasn't loaded yet. */
  customer: CommerceCustomer | null;
  /** Saves an address to the profile if it isn't already there. No-op when `customer` is null. */
  saveAddress: (address: CommerceAddress) => Promise<void>;
  /** Removes the address at `index`. No-op when `customer` is null. */
  removeAddress: (index: number) => Promise<void>;
}

const CommerceCustomerContext = createContext<CommerceCustomerContextValue>({
  customer: null,
  saveAddress: async () => {},
  removeAddress: async () => {},
});

/**
 * Auto-creates (or reads back) the signed-in customer's commerce profile once per session —
 * `CommerceCustomer` is Commerce-owned data (saved addresses today), separate from IAM's
 * identity record. Inert until `COMMERCE_SCHEMAS_DRAFT.json` is imported and
 * `VITE_COMMERCE_SCHEMAS_LIVE` is set — `customer` just stays `null` until then, so
 * consumers (e.g. CheckoutPage) degrade to their current behavior automatically.
 */
export function CommerceCustomerProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [customer, setCustomer] = useState<CommerceCustomer | null>(null);
  const loadedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!COMMERCE_SCHEMAS_LIVE) return;
    if (status !== "authenticated" || !user) {
      setCustomer(null);
      loadedForUser.current = null;
      return;
    }
    if (loadedForUser.current === user.itemId) return;
    loadedForUser.current = user.itemId;

    let cancelled = false;
    ensureCommerceCustomer({
      userId: user.itemId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phoneNumber,
    })
      .then((result) => {
        if (!cancelled) setCustomer(result);
      })
      .catch(() => {
        // Get-or-create failed (offline, transient error) — leave customer null; consumers
        // fall back to their non-Commerce-profile behavior rather than blocking on this.
      });
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  async function saveAddress(address: CommerceAddress) {
    if (!customer) return;
    const addresses = await addCustomerAddress(customer, address);
    setCustomer({ ...customer, addresses });
  }

  async function removeAddress(index: number) {
    if (!customer) return;
    const addresses = customer.addresses.filter((_, i) => i !== index);
    await setCustomerAddresses(customer, addresses);
    setCustomer({ ...customer, addresses });
  }

  return <CommerceCustomerContext.Provider value={{ customer, saveAddress, removeAddress }}>{children}</CommerceCustomerContext.Provider>;
}

export function useCommerceCustomer() {
  return useContext(CommerceCustomerContext);
}
