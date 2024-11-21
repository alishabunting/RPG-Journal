import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route } from "wouter";
import "./index.css";
import { Toaster } from "./components/ui/toaster";
import Home from "./pages/Home";
import Auth from "./pages/Auth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={Auth} />
      <Route>404 - Quest Not Found</Route>
    </Switch>
    <Toaster />
  </StrictMode>
);
