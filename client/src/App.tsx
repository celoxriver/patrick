import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Servers from "./pages/Servers";
import ServerManage from "./pages/ServerManage";
import BotSettings from "./pages/BotSettings";
import TalepLoglari from "./pages/TalepLoglari";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/servers"} component={Servers} />
      {/* /dashboard → /servers yönlendirmesi (geriye dönük uyumluluk) */}
      <Route path={"/dashboard"}>
        <Redirect to="/servers" />
      </Route>
      <Route path={"/servers/:guildId"} component={ServerManage} />
      <Route path={"/servers/:guildId/loglar"} component={TalepLoglari} />
      <Route path={"/servers/:guildId/loglar/:talepId"} component={TalepLoglari} />
      <Route path={"/settings"} component={BotSettings} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
