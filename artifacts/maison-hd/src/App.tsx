import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { TelephonyProvider } from "@/contexts/telephony-context";
import { HelpAssistant } from "@/components/help-assistant";

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
import FbWarehousePage from "@/pages/fb-warehouse";
import FbPosPage from "@/pages/fb-pos";
import FbCostingPage from "@/pages/fb-costing";
import PosSettingsPage from "@/pages/pos-settings";
import FbCustomersPage from "@/pages/fb-customers";
import FbAdminPinPage from "@/pages/fb-admin-pin";
import FbAppsPage from "@/pages/fb-apps";
import FbCashierPage from "@/pages/fb-cashier";
import FbClientGroupsPage from "@/pages/fb-client-groups";
import FbClientsPage from "@/pages/fb-clients";
import FbConfigDeliveryPage from "@/pages/fb-config-delivery";
import FbConfigGeneralPage from "@/pages/fb-config-general";
import FbConfigOrdersPage from "@/pages/fb-config-orders";
import FbConfigReceiptPage from "@/pages/fb-config-receipt";
import FbConfigSecurityPage from "@/pages/fb-config-security";
import FbConfigSubscriptionPage from "@/pages/fb-config-subscription";
import FbConfigTablesPage from "@/pages/fb-config-tables";
import FbConfigTaxesPage from "@/pages/fb-config-taxes";
import FbConfigPage from "@/pages/fb-config";
import FbDeliveryBotPage from "@/pages/fb-delivery-bot";
import FbExceptionsPage from "@/pages/fb-exceptions";
import FbImportPage from "@/pages/fb-import";
import FbIntegrationsPage from "@/pages/fb-integrations";
import FbInventorySessionsPage from "@/pages/fb-inventory-sessions";
import FbLegalEntitiesPage from "@/pages/fb-legal-entities";
import FbLoyaltyPage from "@/pages/fb-loyalty";
import FbMarketingPage from "@/pages/fb-marketing";
import FbMenuPage from "@/pages/fb-menu";
import FbMovementReportPage from "@/pages/fb-movement-report";
import FbOutletsPage from "@/pages/fb-outlets";
import FbPackagingPage from "@/pages/fb-packaging";
import FbPositionsPage from "@/pages/fb-positions";
import FbPostiePage from "@/pages/fb-postie";
import FbPrintCardsPage from "@/pages/fb-print-cards";
import FbPromotionsPage from "@/pages/fb-promotions";
import FbPrroPage from "@/pages/fb-prro";
import FbQrPage from "@/pages/fb-qr";
import FbRegistersPage from "@/pages/fb-registers";
import FbReportAbcPage from "@/pages/fb-report-abc";
import FbReportAiPage from "@/pages/fb-report-ai";
import FbReportOrdersPage from "@/pages/fb-report-orders";
import FbReportProductsPage from "@/pages/fb-report-products";
import FbReportSalesPage from "@/pages/fb-report-sales";
import FbReportsPage from "@/pages/fb-reports";
import FbSessionsPage from "@/pages/fb-sessions";
import FbSettingsPage from "@/pages/fb-settings";
import FbShiftsPage from "@/pages/fb-shifts";
import FbStaffAccessPage from "@/pages/fb-staff-access";
import FbStaffPage from "@/pages/fb-staff";
import FbStopListPage from "@/pages/fb-stop-list";
import FbTransfersPage from "@/pages/fb-transfers";
import FbWarehousesListPage from "@/pages/fb-warehouses-list";
import FbWriteoffsPage from "@/pages/fb-writeoffs";
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
import MigrationCenterPage from "@/pages/migration-center";
import PaymentsLayerPage from "@/pages/payments";
import SalesPage from "@/pages/sales";
import MaintenancePage from "@/pages/maintenance";
import RestaurantPage from "@/pages/restaurant";
import ActivitiesPage from "@/pages/activities";
import AccommodationPage from "@/pages/accommodation";
import StaffConsolePage from "@/pages/staff-console";
import MinibarPage from "@/pages/minibar";
import MinibarGuestPage from "@/pages/minibar-guest";
import PricingPage from "@/pages/pricing";
import PricingCalendarPage from "@/pages/pricing-calendar";
import PitchPage from "@/pages/pitch";
import NightAuditPage from "@/pages/night-audit";
import PackagesPage from "@/pages/packages";
import QrOrderingPage from "@/pages/qr-ordering";
import QrMenuPage from "@/pages/qr-menu";
import LoyaltyPage from "@/pages/loyalty";
import StaffSchedulePage from "@/pages/staff-schedule";
import UpsellPage from "@/pages/upsell";
import RateIntelligencePage from "@/pages/rate-intelligence";
import DigitalKeysPage from "@/pages/digital-keys";
import SustainabilityPage from "@/pages/sustainability";
import TelephonyPage from "@/pages/telephony";
import WaiterStationPage from "@/pages/waiter-station";
import DeliveryPage from "@/pages/delivery";
import RatesPage from "@/pages/rates";
import TechPage from "@/pages/tech";
import LegalPage from "@/pages/legal";
import PublicInvoicePage from "@/pages/public-invoice";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-lg w-full space-y-4">
            <h1 className="text-xl font-bold text-destructive">Помилка додатку</h1>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
              onClick={() => { this.setState({ error: null }); window.location.href = "/dashboard"; }}
            >
              Перейти на головну
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      <Route path="/settings"><ProtectedRoute component={SettingsPage} roles={["super_admin", "owner", "manager"]} /></Route>
      <Route path="/subscription"><ProtectedRoute component={SubscriptionPage} /></Route>
      <Route path="/admin"><ProtectedRoute component={AdminPage} roles={["super_admin"]} /></Route>
      <Route path="/pitch" component={PitchPage} />
      <Route path="/demo-requests"><ProtectedRoute component={DemoRequestsPage} roles={["super_admin"]} /></Route>
      <Route path="/migration"><ProtectedRoute component={MigrationPage} roles={["super_admin", "owner", "manager"]} /></Route>
      <Route path="/demo" component={DemoPage} />
      <Route path="/guest/:code" component={GuestPortalPage} />
      <Route path="/invoice/:token" component={PublicInvoicePage} />
      <Route path="/inbox"><ProtectedRoute component={InboxPage} /></Route>
      <Route path="/spa"><ProtectedRoute component={SpaPage} /></Route>
      <Route path="/events"><ProtectedRoute component={EventsPage} /></Route>
      <Route path="/fb"><ProtectedRoute component={FbPage} /></Route>
      <Route path="/fb-warehouse"><ProtectedRoute component={FbWarehousePage} /></Route>
      <Route path="/fb-pos"><ProtectedRoute component={FbPosPage} /></Route>
      <Route path="/waiter"><ProtectedRoute component={WaiterStationPage} /></Route>
      <Route path="/delivery"><ProtectedRoute component={DeliveryPage} /></Route>
      <Route path="/fb-costing"><ProtectedRoute component={FbCostingPage} /></Route>
      <Route path="/pos-settings"><ProtectedRoute component={PosSettingsPage} /></Route>
      <Route path="/fb-customers"><ProtectedRoute component={FbCustomersPage} /></Route>
      <Route path="/fb/legal-entities"><ProtectedRoute component={FbLegalEntitiesPage} /></Route>
      <Route path="/fb/settings"><ProtectedRoute component={FbSettingsPage} /></Route>
      <Route path="/fb/prro"><ProtectedRoute component={FbPrroPage} /></Route>
      <Route path="/fb/menu"><ProtectedRoute component={FbMenuPage} /></Route>
      <Route path="/fb/import"><ProtectedRoute component={FbImportPage} /></Route>
      <Route path="/fb/qr"><ProtectedRoute component={FbQrPage} /></Route>
      <Route path="/fb/admin-pin"><ProtectedRoute component={FbAdminPinPage} /></Route>
      <Route path="/fb/staff"><ProtectedRoute component={FbStaffPage} /></Route>
      <Route path="/fb/outlets"><ProtectedRoute component={FbOutletsPage} /></Route>
      <Route path="/fb/staff-access"><ProtectedRoute component={FbStaffAccessPage} /></Route>
      <Route path="/fb/positions"><ProtectedRoute component={FbPositionsPage} /></Route>
      <Route path="/fb/registers"><ProtectedRoute component={FbRegistersPage} /></Route>
      <Route path="/fb/sessions"><ProtectedRoute component={FbSessionsPage} /></Route>
      <Route path="/fb/integrations"><ProtectedRoute component={FbIntegrationsPage} /></Route>
      <Route path="/fb/cashier"><ProtectedRoute component={FbCashierPage} /></Route>
      <Route path="/fb/report/ai"><ProtectedRoute component={FbReportAiPage} /></Route>
      <Route path="/fb/report/sales"><ProtectedRoute component={FbReportSalesPage} /></Route>
      <Route path="/fb/report/orders"><ProtectedRoute component={FbReportOrdersPage} /></Route>
      <Route path="/fb/report/products"><ProtectedRoute component={FbReportProductsPage} /></Route>
      <Route path="/fb/report/abc"><ProtectedRoute component={FbReportAbcPage} /></Route>
      <Route path="/fb/shifts"><ProtectedRoute component={FbShiftsPage} /></Route>
      <Route path="/fb/writeoffs"><ProtectedRoute component={FbWriteoffsPage} /></Route>
      <Route path="/fb/transfers"><ProtectedRoute component={FbTransfersPage} /></Route>
      <Route path="/fb/movement-report"><ProtectedRoute component={FbMovementReportPage} /></Route>
      <Route path="/fb/inventory"><ProtectedRoute component={FbInventorySessionsPage} /></Route>
      <Route path="/fb/marketing"><ProtectedRoute component={FbMarketingPage} /></Route>
      <Route path="/fb/promotions"><ProtectedRoute component={FbPromotionsPage} /></Route>
      <Route path="/fb/clients"><ProtectedRoute component={FbClientsPage} /></Route>
      <Route path="/fb/client-groups"><ProtectedRoute component={FbClientGroupsPage} /></Route>
      <Route path="/fb/loyalty"><ProtectedRoute component={FbLoyaltyPage} /></Route>
      <Route path="/fb/exceptions"><ProtectedRoute component={FbExceptionsPage} /></Route>
      <Route path="/fb/reports"><ProtectedRoute component={FbReportsPage} /></Route>
      <Route path="/fb/apps"><ProtectedRoute component={FbAppsPage} /></Route>
      <Route path="/fb/stop-list"><ProtectedRoute component={FbStopListPage} /></Route>
      <Route path="/fb/print-cards"><ProtectedRoute component={FbPrintCardsPage} /></Route>
      <Route path="/fb/postie"><ProtectedRoute component={FbPostiePage} /></Route>
      <Route path="/fb/delivery-bot"><ProtectedRoute component={FbDeliveryBotPage} /></Route>
      <Route path="/fb/config"><ProtectedRoute component={FbConfigPage} /></Route>
      <Route path="/fb/config/general"><ProtectedRoute component={FbConfigGeneralPage} /></Route>
      <Route path="/fb/config/subscription"><ProtectedRoute component={FbConfigSubscriptionPage} /></Route>
      <Route path="/fb/config/orders"><ProtectedRoute component={FbConfigOrdersPage} /></Route>
      <Route path="/fb/config/delivery"><ProtectedRoute component={FbConfigDeliveryPage} /></Route>
      <Route path="/fb/config/tables"><ProtectedRoute component={FbConfigTablesPage} /></Route>
      <Route path="/fb/config/security"><ProtectedRoute component={FbConfigSecurityPage} /></Route>
      <Route path="/fb/config/receipt"><ProtectedRoute component={FbConfigReceiptPage} /></Route>
      <Route path="/fb/config/taxes"><ProtectedRoute component={FbConfigTaxesPage} /></Route>
      <Route path="/fb/warehouses"><ProtectedRoute component={FbWarehousesListPage} /></Route>
      <Route path="/fb/packaging"><ProtectedRoute component={FbPackagingPage} /></Route>
      <Route path="/hq"><ProtectedRoute component={HqPage} /></Route>
      <Route path="/automation"><ProtectedRoute component={AutomationPage} /></Route>
      <Route path="/minibar" component={() => <ProtectedRoute component={MinibarPage} />} />
      <Route path="/minibar-guest/:unitId" component={MinibarGuestPage} />
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
      <Route path="/migration-center"><ProtectedRoute component={MigrationCenterPage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/payments-layer"><ProtectedRoute component={PaymentsLayerPage} /></Route>
      <Route path="/sales"><ProtectedRoute component={SalesPage} /></Route>
      <Route path="/maintenance"><ProtectedRoute component={MaintenancePage} /></Route>
      <Route path="/restaurant"><Redirect to="/fb" /></Route>
      <Route path="/activities"><ProtectedRoute component={ActivitiesPage} /></Route>
      <Route path="/accommodation"><ProtectedRoute component={AccommodationPage} /></Route>
      <Route path="/console"><ProtectedRoute component={StaffConsolePage} /></Route>
      <Route path="/tv/:roomCode" component={TvDisplayPage} />
      <Route path="/pricing"><ProtectedRoute component={PricingPage} /></Route>
      <Route path="/pricing-calendar"><ProtectedRoute component={PricingCalendarPage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/night-audit"><ProtectedRoute component={NightAuditPage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/packages"><ProtectedRoute component={PackagesPage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/qr-ordering"><ProtectedRoute component={QrOrderingPage} /></Route>
      <Route path="/loyalty"><ProtectedRoute component={LoyaltyPage} /></Route>
      <Route path="/staff-schedule"><ProtectedRoute component={StaffSchedulePage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/upsell"><ProtectedRoute component={UpsellPage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/rate-intelligence"><ProtectedRoute component={RateIntelligencePage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/rates"><ProtectedRoute component={RatesPage} roles={["super_admin","owner","manager","reception"]} /></Route>
      <Route path="/digital-keys"><ProtectedRoute component={DigitalKeysPage} /></Route>
      <Route path="/sustainability"><ProtectedRoute component={SustainabilityPage} roles={["super_admin","owner","manager"]} /></Route>
      <Route path="/telephony"><ProtectedRoute component={TelephonyPage} /></Route>
      <Route path="/qr-menu/:orgSlug/:tableId" component={QrMenuPage} />
      <Route path="/qr-menu/:orgSlug" component={QrMenuPage} />
      <Route path="/tech"><ProtectedRoute component={TechPage} /></Route>
      <Route path="/legal/:doc" component={LegalPage} />
      <Route path="/legal" component={LegalPage} />

      <Route path="/" component={HomeRoute} />

      <Route component={NotFound} />
    </Switch>
  );
}

function PushSubscriber() {
  const { data: user } = useGetMe();
  usePushNotifications(!!user);
  return null;
}

function ConditionalHelp() {
  const { data: user } = useGetMe();
  if (!user) return null;
  return <HelpAssistant />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TelephonyProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ErrorBoundary>
              <PushSubscriber />
              <Router />
              <ConditionalHelp />
            </ErrorBoundary>
          </WouterRouter>
          <Toaster />
        </TelephonyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
