/// <reference types="vite/client" />

import * as React from 'react';

declare global {
  interface Window {
    extensionsAPI?: {
      registerResourceExtension(
        component: React.ComponentType<any>,
        group: string,
        kind: string,
        tabTitle: string,
        opts?: {icon?: string}
      ): void;
    };
  }
}

declare module '*?inline' {
  const content: string;
  export default content;
}
