import type { JSDOM } from "jsdom";
import type { TreeNode } from "roamjs-components/types";

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
  }
) => void;
