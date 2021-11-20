import { normalize, setupPage } from "csstips";
import type { AppProps } from "next/app";

normalize();
setupPage("#__next");

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;
