/// <reference types="vite/client" />

declare module "*.yaml?raw" {
  const contents: string;
  export default contents;
}
