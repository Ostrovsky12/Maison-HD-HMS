import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import BookingsPage from "@/pages/bookings";
import UnitsPage from "@/pages/units";
import GuestsPage from "@/pages/guests";
import HousekeepingPage from "@/pages/housekeeping";
import OperationsPage from "@/pages/operations";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import ChessPage from "@/pages/chess";
import InvoicesPage from "@/pages/invoices";
import AnalyticsPage from "@/pages/analytics";
import IntegrationsPage from "@/pages/integrations";
import AdminPage from "@/pages/admin";
import OnboardingPage from "@/pages/onboarding";
import SubscriptionPage from "@/pages/subscription";
import DemoPage from "@/pages/demo";
import DemoRequestsPage from "@/pages/demo-requests";
import MigrationPage from "@/pages/migration";
import GuestPortalPage from "@/pages/guest-portal";
import InboxPage from "@/pages/inbox";
import SpaPage from "@/pages/spa";
import EventsPage from "@/pages/events";
import FbPage from "@/pages/fb";
import HqPage from "@/pages/hq";
import AutomationPage from "@/pages/automation";
import BookPage from "@/pages/book";
import RentalsPage from "@/pages/rentals";
import OtaPage from "@/pages/ota";
import RevenuePage from "@/pages/revenue";
import GuestAppPage from "@/pages/guest-app";
import HotelTvPage from "@/pages/hotel-tv";
import TvDisplayPage from "@/pages/tv-display";
import AiHubPage from "@/pages/ai-hub";
import GuestExperiencePage from "@/pages/guest-experience";
import AccountingPage from "@/pages/accounting";
import FinancePage from "@/pages/finance";
import PaymentsLayerPage from "@/pages/payments";
import SalesPage from "@/pages/sales";
import MaintenancePage from "@/pages/maintenance";
import RestaurantPage from "@/pages/restaurant";
import ActivitiesPage from "@/pages/activities";
import AccommodationPage from "@/pages/accommodation";
import StaffConsolePage from "@/pages/staff-console";
import PricingPage from "@/pages/pricing";
import PitchPage from "@/pages/pitch";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, roles }: { component: React.ComponentType; roles?: string[] }) {
  const { data: user, isLoading, error } = useGetMe();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !user) {
    return <Redirect to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  // Redirect new owners/managers to onboarding wizard on first login
  const onboardingDone = localStorage.getItem("mhd_onboarding_done");
  if (!onboardingDone && (user.role === "owner" || user.role === "manager")) {
    return <Redirect to="/onboarding" />;
  }

  return <Component />;
}

function HomeRoute() {
  const { data: user, isLoading } = useGetMe();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <DemoPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
      <Route path="/bookings"><ProtectedRoute component={BookingsPage} /></Route>
      <Route path="/units"><ProtectedRoute component={UnitsPage} /></Route>
      <Route path="/guests"><ProtectedRoute component={GuestsPage} /></Route>
      <Route path="/chess"><ProtectedRoute component={ChessPage} /></Route>
      <Route path="/housekeeping"><ProtectedRoute component={HousekeepingPage} /></Route>
      <Route path="/operations"><ProtectedRoute component={OperationsPage} /></Route>
      <Route path="/invoices"><ProtectedRoute component={InvoicesPage} /></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage} /></Route>
      <Route path="/analytics"><ProtectedRoute component={AnalyticsPage} /></Route>
      <Route path="/integrations"><ProtectedRoute component={IntegrationsPage} /></Route>
      <Route path="/settings"><ProtectedRoute component={SettingsPage} /></Route>
      <Route path="/subscription"><ProtectedRoute component={SubscriptionPage} /></Route>
      <Route path="/admin"><ProtectedRoute component={AdminPage} roles={["super_admin"]} /></Route>
      <Route path="/pitch"><ProtectedRoute component={PitchPage} /></Route>
      <Route path="/demo-requests"><ProtectedRoute component={DemoRequestsPage} roles={["super_admin"]} /></Route>
      <Route path="/migration"><ProtectedRoute component={MigrationPage} roles={["super_admin", "owner", "manager"]} /></Route>
      <Route path="/demo" component={DemoPage} />
      <Route path="/guest/:code" component={GuestPortalPage} />
      <Route path="/inbox"><ProtectedRoute component={InboxPage} /></Route>
      <Route path="/spa"><ProtectedRoute component={SpaPage} /></Route>
      <Route path="/events"><ProtectedRoute component={EventsPage} /></Route>
      <Route path="/fb"><ProtectedRoute component={FbPage} /></Route>
      <Route path="/hq"><ProtectedRoute component={HqPage} /></Route>
      <Route path="/automation"><ProtectedRoute component={AutomationPage} /></Route>
      <Route path="/book" component={BookPage} />
      <Route path="/rentals"><ProtectedRoute component={RentalsPage} /></Route>
      <Route path="/ota"><ProtectedRoute component={OtaPage} /></Route>
      <Route path="/revenue"><ProtectedRoute component={RevenuePage} /></Route>
      <Route path="/guest-app" component={GuestAppPage} />
      <Route path="/hotel-tv"><ProtectedRoute component={HotelTvPage} /></Route>
      <Route path="/ai-hub"><ProtectedRoute component={AiHubPage} /></Route>
      <Route path="/guest-experience"><ProtectedRoute component={GuestExperiencePage} /></Route>
      <Route path="/accounting"><ProtectedRoute component={AccountingPage} /></Route>
      <Route path="/finance"><ProtectedRoute component={FinancePage} /></Route>
      <Route path="/payments-layer"><ProtectedRoute component={PaymentsLayerPage} /></Route>
      <Route path="/sales"><ProtectedRoute component={SalesPage} /></Route>
      <Route path="/maintenance"><ProtectedRoute component={MaintenancePage} /></Route>
      <Route path="/restaurant"><Redirect to="/fb" /></Route>
      <Route path="/activities"><ProtectedRoute component={ActivitiesPage} /></Route>
      <Route path="/accommodation"><ProtectedRoute component={AccommodationPage} /></Route>
      <Route path="/console"><ProtectedRoute component={StaffConsolePage} /></Route>
      <Route path="/tv/:roomCode" component={TvDisplayPage} />
      <Route path="/pricing"><ProtectedRoute component={PricingPage} /></Route>

      <Route path="/" component={HomeRoute} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
