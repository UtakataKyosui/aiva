import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import App from './App';

const rootRoute = createRootRoute({
  component: App,
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
});

const suggestionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'suggestion',
  component: () => null,
});

const ingredientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'ingredients',
  component: () => null,
});

const mealsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'meals',
  component: () => null,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings',
  component: () => null,
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  suggestionRoute,
  ingredientsRoute,
  mealsRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
