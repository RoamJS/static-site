import type { JSDOM } from "jsdom";
import type { TreeNode } from "roamjs-components/types";

export type RenderFunction = (
  dom: JSDOM,
  props: Record<string, string[]>,
  context: {
    convertPageNameToPath: (s: string) => string;
    references: { title: string; node: TreeNode }[];
    pageName: string;
    deployId: string;
  }
) => void;
