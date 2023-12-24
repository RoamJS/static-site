import type { JSDOM } from "jsdom";
import type { TreeNode } from "roamjs-components/types";
import type { RoamContext } from "roamjs-components/marked";

export type PartialRecursive<T> = T extends object
  ? { [K in keyof T]?: PartialRecursive<T[K]> }
  : T;

export type RenderFunction = (
  dom: JSDOM,
  props: Record<string, string[]>,
  context: {
    convertPageNameToPath: (s: string) => string;
    references: { title: string; node: PartialRecursive<TreeNode> }[];
    pageName: string;
    deployId: string;
    parseInline: (str: string, ctx?: Omit<RoamContext, "marked">) => string;
  }
) => void;

declare global {
  interface Window {
    roamjsProps: Record<string, unknown>;
  }
}
