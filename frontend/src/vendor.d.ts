import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      // ponytail: customizable <select> API element, not in React's types yet
      selectedcontent: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
