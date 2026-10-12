import type { ComponentProps } from 'react';
import type { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';

// SDK appName yields to the dashboard display name. Customize the application
// greeting through the supported locale API; provider identity stays unchanged.
export const dynamicLocale = {
  en: {
    dyn_collect_user_data: {
      greeting: 'Welcome to Aetheris',
      description: 'Complete your account details to finish signing in.',
    },
  },
} satisfies NonNullable<ComponentProps<typeof DynamicContextProvider>['locale']>;
