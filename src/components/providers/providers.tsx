"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";
import { CartProvider } from "./cart-provider";
import { WishlistProvider } from "./wishlist-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>{children}</WishlistProvider>
          </CartProvider>
        </AuthProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
