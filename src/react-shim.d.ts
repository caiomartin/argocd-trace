declare namespace React {
  type ReactNode = any;
  interface Attributes { key?: string | number; }
  interface FunctionComponent<P = {}> {
    (props: P): any;
  }
}

declare module 'react' {
  export = React;
  export const Fragment: any;
  export function useState<T>(initial: T): [T, (value: T | ((current: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), dependencies?: unknown[]): void;
  export function useMemo<T>(factory: () => T, dependencies?: unknown[]): T;
}

declare module 'react-dom' {
  const ReactDOM: {render(element: any, container: Element | DocumentFragment): void};
  export = ReactDOM;
}

declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare namespace JSX {
  interface Element {}
  interface ElementClass { render: any; }
  interface ElementAttributesProperty { props: {}; }
  interface ElementChildrenAttribute { children: {}; }
  interface IntrinsicAttributes extends React.Attributes {}
  interface IntrinsicElements { [elementName: string]: any; }
}
