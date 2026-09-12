import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Providers } from "@/components/providers/providers";
import HomePage from "@/pages/HomePage";
import ProductListingPage from "@/pages/ProductListingPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import OrderConfirmationPage from "@/pages/OrderConfirmationPage";
import WishlistPage from "@/pages/WishlistPage";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import AccountOrdersPage from "@/pages/AccountOrdersPage";
import AccountOrderDetailPage from "@/pages/AccountOrderDetailPage";
import AccountAddressesPage from "@/pages/AccountAddressesPage";
import AccountProfilePage from "@/pages/AccountProfilePage";
import { RequireAuth } from "@/components/providers/require-auth";

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductListingPage />} />
          <Route path="/product/:slug" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmation" element={<OrderConfirmationPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/login/callback" element={<AuthCallbackPage />} />
          {/* Everything under /account is the customer's own data, so it's gated — unlike the
              rest of the storefront, which is deliberately public. /account itself redirects
              to Orders rather than being a separate dashboard with nothing on it. */}
          <Route path="/account" element={<Navigate to="/account/orders" replace />} />
          <Route path="/account/orders" element={<RequireAuth><AccountOrdersPage /></RequireAuth>} />
          <Route path="/account/orders/:orderId" element={<RequireAuth><AccountOrderDetailPage /></RequireAuth>} />
          <Route path="/account/addresses" element={<RequireAuth><AccountAddressesPage /></RequireAuth>} />
          <Route path="/account/profile" element={<RequireAuth><AccountProfilePage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  );
}
