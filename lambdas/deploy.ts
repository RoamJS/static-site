import path from "path";
import fs from "fs";
import AWS from "aws-sdk";
import {
  cloudfront,
  createLogStatus,
  getStackParameter,
  graphToStackName,
} from "./common/common";
import { RenderFunction, HydratedTreeNode } from "./common/types";
import chromium from "chrome-aws-lambda";
import {
  parseRoamDate,
  RoamBlock,
  TreeNode,
  ViewType,
  extractTag,
  extractRef,
  DAILY_NOTE_PAGE_TITLE_REGEX,
  parseInline,
  RoamMarkedContext,
  BLOCK_REF_REGEX,
} from "roam-client";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { JSDOM } from "jsdom";
import DailyLog from "../components/DailyLog";
import InlineBlockReference from "../components/InlineBlockReference";
import { render as renderHeader } from "../components/Header";
import { render as renderFooter } from "../components/Footer";
import { render as renderSidebar } from "../components/Sidebar";
import { render as renderImagePreview } from "../components/ImagePreview";
import axios from "axios";
import mime from "mime-types";
import Mustache from "mustache";

const transformIfTrue = (s: string, f: boolean, t: (s: string) => string) =>
  f ? t(s) : s;
const CONFIG_PAGE_NAMES = ["roam/js/static-site", "roam/js/public-garden"];
const IGNORE_BLOCKS = CONFIG_PAGE_NAMES.map((c) => `${c}/ignore`);
const TITLE_REGEX = new RegExp(
  `(?:${CONFIG_PAGE_NAMES.map((c) => `${c.replace("/", "\\/")}/title`).join(
    "|"
  )})::(.*)`
);
const HEAD_REGEX = new RegExp(
  `(?:${CONFIG_PAGE_NAMES.map((c) => `${c.replace("/", "\\/")}/head`).join(
    "|"
  )})::`
);
const METADATA_REGEX = /roam\/js\/static-site\/([a-z-]+)::(.*)/;
const CODE_REGEX = new RegExp("```[a-z]*\n(.*)```", "s");
const HTML_REGEX = new RegExp("```html\n(.*)```", "s");
const CSS_REGEX = new RegExp("```css\n(.*)```", "s");
const UPLOAD_REGEX = /(https?:\/\/[^\)]*)(?:$|\)|\s)/;
const DAILY_NOTE_PAGE_REGEX =
  /(January|February|March|April|May|June|July|August|September|October|November|December) [0-3]?[0-9](st|nd|rd|th), [0-9][0-9][0-9][0-9]/;

const allBlockMapper = (t: TreeNode): TreeNode[] => [
  t,
  ...t.children.flatMap(allBlockMapper),
];

const ensureDirectoryExistence = (filePath: string) => {
  var dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
    return true;
  }
};

type Filter = {
  rule: string;
  value: string;
  layout: string;
  variables: Record<string, string>;
};

type InputConfig = {
  index?: string;
  filter?: Filter[];
  template?: string;
  referenceTemplate?: string;
  plugins?: Record<string, Record<string, string[]>>;
  theme?: Record<string, Record<string, string>>;
  files?: Record<string, string>;
};

declare global {
  interface Window {
    fixViewType: (t: { c: TreeNode; v: ViewType }) => TreeNode;
    getTreeByBlockId: (id: number) => TreeNode;
    getTreeByPageName: (name: string) => TreeNode[];
    roamjsProps: { [id: string]: Record<string, unknown> };
  }
}

export const defaultConfig: Required<InputConfig> = {
  index: "Website Index",
  filter: [],
  template: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="description" content="$\{PAGE_DESCRIPTION}"/>
<meta property="og:description" content="$\{PAGE_DESCRIPTION}">
<title>$\{PAGE_NAME}</title>
<meta property="og:title" content="$\{PAGE_NAME}">
<meta property="og:type" content="website">
</head>
<body>
<div id="content">
$\{PAGE_CONTENT}
</div>
<div id="references">
<ul>
$\{REFERENCES}
</ul>
</div>
</body>
</html>`,
  referenceTemplate: '<li><a href="${LINK}">${REFERENCE}</a></li>',
  plugins: {},
  theme: {},
  files: {},
};

const DEFAULT_STYLE = `body {
  margin: 0;
}
.rm-highlight {
  background-color: hsl(51, 98%, 81%);
  margin: -2px;
  padding: 2px;
}
.rm-bold {
  font-weight: bold;
}
.rm-iframe-container {
  position: relative;
  overflow: hidden;
  width: 100%;
  padding-top: 56.25%;
}
.rm-iframe {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  width: 100%;
  height: 100%;
}
.document-bullet {
  list-style: none;
}
.rm-block-ref {
  padding: 2px 2px;
  margin: -2px 0;
  display: inline;
  border-bottom: .5px solid #D8E1E8;
  cursor: alias;
  color: #202B33;
}
.rm-block-ref:hover {
  cursor: alias;
  color: #202B33;
  background-color: #F5F8FA;
  text-decoration: none;
}
.rm-embed-container {
  position: relative;
  display: flex;
  padding: 1px 16px;
  background-color: #EBF1F5;
  margin-bottom: 8px;
}
.rm-embed-container>div>div {
  padding-left: 16px;
}
.rm-embed-link {
  position: absolute;
  right: 8px;
  display: inline-block;
  font-size: 1.5em;
}
td {
  font-size: 12px;
  min-width: 100px;
  max-height: 20px;
  padding: 8px 16px;
  border: 1px solid grey;
}
table {
  border-spacing: 0;
  border-collapse: collapse;
}
#content {
  box-sizing: border-box;
}
h1, h2, h3, p {
  white-space: pre-wrap;
}
.roam-block img {
  width: 100%;
}
.rm-bq {
  background-color: #F5F8FA;
  border-left: 5px solid #30404D;
  padding: 10px 20px;
}
`;

const renderComponent = <T extends Record<string, unknown>>({
  Component,
  id,
  props,
}: {
  Component: React.FunctionComponent<T>;
  id: string;
  props?: T;
}) => {
  const component = ReactDOMServer.renderToString(
    React.createElement(
      "div",
      { id, className: "roamjs-react-plugin" },
      React.createElement(Component, props)
    )
  );
  return component;
};

const pageReferences: { current: { [p: string]: string[] } } = { current: {} };
const getTitleRuleFromNode = ({ rule: text, value }: Filter) => {
  const ruleType = text.trim().toUpperCase();
  if (ruleType === "STARTS WITH" && value) {
    const tag = extractTag(value);
    return (title: string) => {
      return title.startsWith(tag);
    };
  } else if (ruleType === "DAILY") {
    return (title: string) => DAILY_NOTE_PAGE_TITLE_REGEX.test(title);
  } else if (ruleType === "ALL") {
    return () => true;
  } else if (ruleType === "TAGGED WITH" && value) {
    const tag = extractTag(value);
    const references = pageReferences.current[tag] || [];
    return (title: string) => references.includes(title);
  }
  return undefined;
};

const getParsedTree = async ({
  evaluate,
  pageName,
}: {
  evaluate: (fcn: (s: string) => TreeNode[], s: string) => Promise<TreeNode[]>;
  pageName: string;
}) => {
  try {
    return await evaluate(
      (pageName: string) => window.getTreeByPageName(pageName),
      pageName
    );
  } catch (e) {
    console.error(`Failed to get Tree for ${pageName}`);
    throw new Error(e);
  }
};

const getConfigFromPage = (parsedTree: TreeNode[]) => {
  const getConfigNode = (key: string) =>
    parsedTree.find((n) => n.text.trim().toUpperCase() === key.toUpperCase());
  const indexNode = getConfigNode("index");
  const filterNode = getConfigNode("filter");
  const templateNode = getConfigNode("template");
  const referenceTemplateNode = getConfigNode("reference template");
  const pluginsNode = getConfigNode("plugins");
  const themeNode = getConfigNode("theme");
  const filesNode = getConfigNode("files");
  const getCode = (node?: TreeNode) =>
    (node?.children || [])
      .map((s) => s.text.match(HTML_REGEX))
      .find((s) => !!s)?.[1];
  const template = getCode(templateNode);
  const referenceTemplate = getCode(referenceTemplateNode);
  const withIndex: InputConfig = indexNode?.children?.length
    ? { index: extractTag(indexNode.children[0].text.trim()) }
    : {};
  const withFilter: InputConfig = filterNode?.children?.length
    ? {
        filter: filterNode.children.map((t) => ({
          rule: t.text,
          value: t.children[0]?.text,
          layout: getCode(t.children[0]),
          variables: Object.fromEntries(
            t.children.slice(1).map((t) => [t.text, t.children[0]?.text])
          ),
        })),
      }
    : {};
  const withTemplate: InputConfig = template
    ? {
        template,
      }
    : {};
  const withReferenceTemplate: InputConfig = referenceTemplate
    ? { referenceTemplate }
    : {};
  const withPlugins: InputConfig = pluginsNode?.children?.length
    ? {
        plugins: Object.fromEntries(
          pluginsNode.children.map((p) => [
            p.text,
            Object.fromEntries(
              (p.children || []).map((c) => [
                c.text,
                c.children.map((v) => v.text),
              ])
            ),
          ])
        ),
      }
    : {};
  const withTheme: InputConfig = themeNode?.children?.length
    ? {
        theme: Object.fromEntries(
          themeNode.children.map((p) => [
            p.text,
            Object.fromEntries(
              (p.children || []).map((c) => [c.text, c.children[0]?.text])
            ),
          ])
        ),
      }
    : {};
  const withFiles: InputConfig = filesNode?.children?.length
    ? {
        files: Object.fromEntries(
          filesNode.children.map(({ text, children = [] }) => [
            text,
            extractRef(children[0]?.text || ""),
          ])
        ),
      }
    : {};
  return {
    ...withIndex,
    ...withFilter,
    ...withTemplate,
    ...withReferenceTemplate,
    ...withPlugins,
    ...withTheme,
    ...withFiles,
  };
};

const VIEW_CONTAINER = {
  bullet: "ul",
  document: "div",
  numbered: "ol",
};

const HEADINGS = ["p", "h1", "h2", "h3"];

const cleanText = (s: string) => {
  if (CODE_REGEX.test(s)) {
    return s;
  }
  return s.replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
};

const convertContentToHtml = ({
  content,
  viewType,
  level,
  context,
  useInlineBlockReferences,
  pages,
}: {
  level: number;
  context: Required<RoamMarkedContext>;
  useInlineBlockReferences: boolean;
  pages: Record<string, PageContent>;
} & Pick<PageContent, "content" | "viewType">): string => {
  if (content.length === 0) {
    return "";
  }
  const items = content.map((t) => {
    let skipChildren = false;
    const componentsWithChildren = (s: string, ac?: string): string | false => {
      const parent = context.components(s, ac);
      if (parent) {
        return parent;
      }
      if (/table/i.test(s)) {
        skipChildren = true;
        return `<table><tbody>${t.children
          .map(
            (row) =>
              `<tr>${[row, ...row.children.flatMap(allBlockMapper)]
                .map(
                  (td) =>
                    `<td>${parseInline(cleanText(td.text), {
                      ...context,
                      components: componentsWithChildren,
                    })}</td>`
                )
                .join("")}</tr>`
          )
          .join("")}</tbody></table>`;
      } else if (/static site/i.test(s) && ac) {
        if (/inject/i.test(ac)) {
          const node = t.children.find((c) => HTML_REGEX.test(c.text))?.text;
          if (node) {
            skipChildren = true;
            const template = node.match(HTML_REGEX)?.[1];
            if (!template) return false;
            return Mustache.render(
              template,
              {
                PAGES: Object.entries(pages).map(
                  ([name, { layout, metadata }]) => ({
                    name,
                    filter: typeof layout === "undefined" ? -1 : layout,
                    metadata,
                  })
                ),
              },
              {},
              {
                tags: ["${", "}"],
                escape: (s) => s,
              }
            );
          }
        }
      }
      return false;
    };
    const classlist = ["roam-block"];
    const textToParse = t.text.replace(/#\.([^\s]*)/g, (_, className) => {
      classlist.push(className);
      return "";
    });
    const inlineMarked = parseInline(textToParse, {
      ...context,
      components: componentsWithChildren,
    });
    const children = skipChildren
      ? ""
      : convertContentToHtml({
          content: t.children,
          viewType: t.viewType,
          useInlineBlockReferences,
          level: level + 1,
          context,
          pages,
        });
    const rawHeading = HEADINGS[t.heading];
    const headingTag =
      // p tags cannot contain divs
      rawHeading === "p" && /<div/.test(inlineMarked) ? "div" : rawHeading;
    const pageNameSet = new Set(Object.keys(pages));
    const innerHtml = `<${headingTag}>${inlineMarked}</${headingTag}>${
      useInlineBlockReferences
        ? renderComponent({
            Component: InlineBlockReference,
            id: `${t.uid}-inline-references`,
            props: {
              blockReferences: t.references.filter((tr) =>
                pageNameSet.has(tr.title)
              ),
            },
          })
        : ""
    }\n${children}`;
    if (level > 0 && viewType === "document") {
      classlist.push("document-bullet");
    }
    const attrs = `id="${t.uid}" class="${classlist.join(" ")}"`;
    const blockHtml =
      level === 0 && viewType === "document"
        ? `<div ${attrs}>${innerHtml}</div>`
        : `<li ${attrs}>${innerHtml}</li>`;

    return blockHtml;
  });
  const containerTag =
    level > 0 && viewType === "document" ? "ul" : VIEW_CONTAINER[viewType];
  return `<${containerTag}>${items.join("\n")}</${containerTag}>`;
};

type PageContent = {
  content: HydratedTreeNode[];
  references: { title: string; node: HydratedTreeNode }[];
  head: string;
  viewType: ViewType;
  uid: string;
  metadata: Record<string, string>;
  layout: number;
};

const PLUGIN_RENDER: {
  [key: string]: RenderFunction;
} = {
  header: renderHeader,
  sidebar: renderSidebar,
  "image-preview": renderImagePreview,
  footer: renderFooter,
};

const inlineTryCatch = <T>(tryFcn: () => T, catchFcn: (e: Error) => T): T => {
  try {
    return tryFcn();
  } catch (e) {
    return catchFcn(e);
  }
};

export const renderHtmlFromPage = ({
  outputPath,
  pages,
  p,
  layout,
  config,
  blockReferencesCache,
  theme,
}: {
  outputPath: string;
  pages: Record<string, PageContent>;
  layout: string;
  p: string;
  config: Required<InputConfig>;
  theme: string;
  blockReferencesCache: Record<
    string,
    { node: HydratedTreeNode; page: string }
  >;
}): void => {
  const { content, references = [], head, metadata = {}, viewType } = pages[p];
  const pageNameSet = new Set(Object.keys(pages));
  const uidByName = Object.fromEntries(
    Object.entries(pages).map(([name, { uid }]) => [name, uid])
  );
  const pathConfigType = config.plugins["paths"]?.["type"] || [];
  const useLowercase = pathConfigType.includes("lowercase");
  const useUid =
    pathConfigType.includes("uid") || !!config.plugins["uid-paths"];
  const convertPageNameToPath = (name: string): string =>
    name === config.index
      ? "/"
      : useUid
      ? uidByName[name]
      : transformIfTrue(
          `${name
            .split(/\//)
            .map((s) =>
              encodeURIComponent(
                s.replace(/ /g, "_").replace(/[^\w-]/g, "")
              )
            )
            .join("/")}`,
          useLowercase,
          (s) => s.toLowerCase()
        );
  const htmlFileName = convertPageNameToPath(p);
  const pagesToHrefs = (name: string, r?: string) =>
    pageNameSet.has(name)
      ? `/${convertPageNameToPath(name).replace(/^\/$/, "")}${r ? `#${r}` : ""}`
      : "";
  const pluginKeys = Object.keys(config.plugins);
  const useInlineBlockReferences = pluginKeys.includes(
    "inline-block-references"
  );

  const blockReferences = (u: string) => ({
    text: blockReferencesCache[u]?.node?.text,
    page: blockReferencesCache[u]?.page,
  });
  const converter = ({ content }: { content: HydratedTreeNode[] }): string => {
    const filterIgnore = (t: TreeNode) => {
      if (IGNORE_BLOCKS.some((ib) => t.text.trim().includes(ib))) {
        return false;
      }
      t.children = t.children.filter(filterIgnore);
      return true;
    };
    const preparedContent = content.filter(filterIgnore);
    return convertContentToHtml({
      content: preparedContent,
      viewType,
      useInlineBlockReferences,
      pages,
      level: 0,
      context: {
        pagesToHrefs,
        components: (s, ac) => {
          if (/static site/i.test(s)) {
            if (ac && /daily log/i.test(ac)) {
              const referenceContent = references
                .map(({ node: { children = [], ...nodeRest }, ...rest }) => ({
                  ...rest,
                  node: {
                    ...nodeRest,
                    children: children.filter(
                      (c) => !!c.text || !!c.children?.length
                    ),
                  },
                }))
                .filter(
                  ({ title, node: { children = [] } }) =>
                    DAILY_NOTE_PAGE_REGEX.test(title) && children.length
                )
                .sort(
                  ({ title: a }, { title: b }) =>
                    parseRoamDate(b).valueOf() - parseRoamDate(a).valueOf()
                )
                .map(({ node, title }) => ({
                  ...node,
                  text: node.text.replace(p, title),
                }));
              const firstNode = referenceContent[0];
              const firstDate = parseRoamDate(
                firstNode?.text?.match?.(DAILY_NOTE_PAGE_REGEX)?.[0] || ""
              );
              const allContent = referenceContent.slice(1).reduce(
                (prev, cur) => {
                  const lastNode = prev[prev.length - 1];
                  const curDate = parseRoamDate(
                    cur.text.match(DAILY_NOTE_PAGE_REGEX)?.[0] || ""
                  );
                  if (
                    lastNode.month === curDate.getMonth() &&
                    lastNode.year === curDate.getFullYear()
                  ) {
                    lastNode.nodes.push(cur);
                    return prev;
                  } else {
                    return [
                      ...prev,
                      {
                        nodes: [cur],
                        month: curDate.getMonth(),
                        year: curDate.getFullYear(),
                      },
                    ];
                  }
                },
                firstNode
                  ? [
                      {
                        nodes: [firstNode],
                        month: firstDate.getMonth(),
                        year: firstDate.getFullYear(),
                      },
                    ]
                  : []
              );
              return `${renderComponent({
                Component: DailyLog,
                id: `${p}-daily-log`,
                props: {
                  allContent: allContent.map(({ nodes, ...p }) => ({
                    ...p,
                    html: converter({
                      content: nodes,
                    }),
                  })),
                },
              })}`;
            }
          } else if (/embed/i.test(s)) {
            const uid = BLOCK_REF_REGEX.exec(ac.trim())?.[1];
            if (uid) {
              return (
                blockReferencesCache[uid] &&
                `<div class="rm-embed-container">${converter({
                  content: [blockReferencesCache[uid].node],
                })}<a class="rm-embed-link" href="${pagesToHrefs(
                  blockReferencesCache[uid].page,
                  uid
                )}"> ↗ </a></div>`
              );
            }
            const tag = extractTag(ac.trim());
            if (tag) {
              return `<div class="rm-embed-container"><div><h3><a href="${pagesToHrefs(
                tag
              )}">${tag}</a></h3><div>${converter({
                content: pages[tag]?.content || [],
              })}</div></div></div>`;
            }
            return `Failed to embed ${ac}`;
          }
          return "";
        },
        blockReferences,
      },
    });
  };
  const markedContent = inlineTryCatch(
    () => converter({ content }),
    (e) => `<div>Failed to render page: ${p}</div><div>${e.message}</div>`
  );
  const hydratedHtml = config.template
    .replace(
      /\${PAGE_CONTENT}/g,
      layout.replace(/\${PAGE_CONTENT}/g, markedContent)
    )
    .replace(
      /\${PAGE_([A-Z_]+)}/g,
      (_, k: string) => metadata[k.toLowerCase().replace(/_/g, "-")] || ""
    )
    .replace(
      /\${REFERENCES}/g,
      Array.from(new Set(references.map((r) => r.title)))
        .filter((r) => pageNameSet.has(r))
        .map((r) =>
          config.referenceTemplate
            .replace(/\${REFERENCE}/g, r)
            .replace(/\${LINK}/g, convertPageNameToPath(r))
        )
        .join("\n")
    );
  const dom = new JSDOM(hydratedHtml);
  dom.window.document.head.innerHTML = `${dom.window.document.head.innerHTML}${head}`;
  pluginKeys.forEach((k) =>
    PLUGIN_RENDER[k]?.(dom, config.plugins[k], {
      convertPageNameToPath,
      references,
      pageName: p,
    })
  );
  const cssContent = `${DEFAULT_STYLE}\n${theme}\n${
    CSS_REGEX.exec(config.theme?.layout?.css)?.[1] || ""
  }`;
  fs.writeFileSync(path.join(outputPath, "theme.css"), cssContent);
  const link = dom.window.document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = "/theme.css";
  dom.window.document.head.appendChild(link);

  // temporary until we figure out a better option:
  // 1. include this in marked
  // 2. figure out tree shaking so that it goes back in image caption
  dom.window.document
    .querySelectorAll<HTMLImageElement>(".roam-block img")
    .forEach((img) => {
      if (img.alt) {
        const caption = dom.window.document.createElement("div");
        caption.innerHTML = parseInline(img.alt);
        caption.classList.add("roamjs-image-caption");
        img.parentElement.appendChild(caption);
      }
    });

  const newHtml = dom.serialize();
  const fileName = htmlFileName === "/" ? "index.html" : `${htmlFileName}.html`;
  const filePath = path.join(outputPath, fileName);
  ensureDirectoryExistence(filePath);
  fs.writeFileSync(filePath, newHtml);
};

export const processSiteData = async ({
  pages,
  outputPath,
  config,
  info,
}: {
  info: (s: string) => void;
  config: Required<InputConfig>;
  outputPath: string;
  pages: {
    [k: string]: PageContent;
  };
}): Promise<InputConfig> => {
  const pageNames = Object.keys(pages).sort();
  info(
    `resolving ${pageNames.length} pages ${new Date().toLocaleTimeString()}`
  );
  info(`Here are some: ${pageNames.slice(0, 5)}`);
  const blockReferencesCache: {
    [p: string]: { node: HydratedTreeNode; page: string };
  } = {};
  pageNames.forEach((page) => {
    const { content } = pages[page];
    const forEach = (node: HydratedTreeNode) => {
      blockReferencesCache[node.uid] = { node, page };
      node.children.forEach(forEach);
    };
    content.forEach(forEach);
  });
  let theme = "";
  if (config.theme.text) {
    if (config.theme.text.font) {
      theme = `body {\n  font-family: ${config.theme.text.font};\n}\n${theme}`;
    }
  }
  if (config.theme?.layout) {
    const { width } = config.theme.layout;
    if (width) {
      const widthStyle = /\d$/.test(width) ? `${width}px` : width;
      theme = `#content, #references {\n  margin: auto;\n  width: ${widthStyle};\n}\n${theme}`;
    }
  }

  pageNames.map((p) => {
    renderHtmlFromPage({
      outputPath,
      config,
      pages,
      layout: config.filter[pages[p].layout]?.layout || "${PAGE_CONTENT}",
      p,
      blockReferencesCache,
      theme,
    });
  });

  await Promise.all(
    Object.entries(config.files)
      .filter(([, url]) => !!url)
      .map(([p, url]) =>
        axios.get(url, { responseType: "stream" }).then((r) => {
          const filename = path.join(outputPath, p);
          const dirname = path.dirname(filename);
          if (!fs.existsSync(dirname))
            fs.mkdirSync(dirname, { recursive: true });
          return r.data.pipe(fs.createWriteStream(filename));
        })
      )
  );

  if (config.theme?.layout?.favicon) {
    const url =
      UPLOAD_REGEX.exec(config.theme.layout.favicon)?.[1] ||
      config.theme.layout.favicon;
    await axios
      .get(url, { responseType: "stream" })
      .then((r) => {
        r.data.pipe(
          fs.createWriteStream(path.join(outputPath, "./favicon.ico"))
        );
      })
      .catch(() => console.warn("invalid favicon"));
  }
  return config;
};

export const run = async ({
  roamUsername,
  roamPassword,
  roamGraph,
  logger = { info: console.log, error: console.error },
  pathRoot = process.cwd(),
  inputConfig = {},
  debug = false,
}: {
  roamUsername: string;
  roamPassword: string;
  roamGraph: string;
  logger?: {
    info: (s: string) => void;
    error: (s: string) => void;
  };
  pathRoot?: string;
  inputConfig?: InputConfig;
  debug?: boolean;
}): Promise<InputConfig> => {
  const { info, error } = logger;
  info(
    `Hello ${roamUsername}! Fetching from ${roamGraph}... ${new Date().toLocaleTimeString()}`
  );

  const chromiumPath = await chromium.executablePath;
  const executablePath = chromiumPath
    ? chromiumPath
    : process.platform === "win32"
    ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/bin/google-chrome-stable";

  return chromium.puppeteer
    .launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    })
    .then(async (browser) => {
      const page = await browser.newPage();
      try {
        const outputPath = path.join(pathRoot, "out");
        fs.mkdirSync(outputPath, { recursive: true });

        await page.goto("https://roamresearch.com/#/signin?disablejs=true", {
          waitUntil: "networkidle0",
        });
        // Roam's doing this weird refresh thing. let's just hardcode it
        await page.waitForTimeout(5000);
        await page.waitForSelector("input[name=email]", {
          timeout: 120000,
        });
        await page.type("input[name=email]", roamUsername);
        await page.type("input[name=password]", roamPassword);
        await page.click("button.bp3-button");
        info(`Signing in ${new Date().toLocaleTimeString()}`);
        await page.waitForSelector(`a[href="#/app/${roamGraph}"]`, {
          timeout: 120000,
        });
        info(
          `Done waiting for graph to be selectable ${new Date().toLocaleTimeString()}`
        );
        await page.evaluate(
          (roamGraph) =>
            document
              .querySelector(`a[href="#/app/${roamGraph}"]`)
              ?.scrollIntoView(),
          roamGraph
        );
        await page.waitForTimeout(5000);
        info(
          `Done waiting for page to scroll ${new Date().toLocaleTimeString()}`
        );
        await page.click(`a[href="#/app/${roamGraph}"]`);
        info(`entering graph ${new Date().toLocaleTimeString()}`);
        await page.waitForSelector("span.bp3-icon-more", {
          timeout: 120000,
        });
        const allPageNames = await page.evaluate(() => {
          return window.roamAlphaAPI
            .q("[:find ?s :where [?e :node/title ?s]]")
            .map((b) => b[0] as string);
        });
        await page.evaluate(() => {
          window.getTreeByBlockId = (blockId: number): TreeNode => {
            const block = window.roamAlphaAPI.pull(
              "[:block/children, :block/string, :block/order, :block/uid, :block/heading, :block/open, :children/view-type]",
              blockId
            );
            const children = block[":block/children"] || [];
            const uid = block[":block/uid"] || "";
            const props = block[":block/props"] || {};
            return {
              text: block[":block/string"] || "",
              order: block[":block/order"] || 0,
              uid,
              children: children
                .map((c) => window.getTreeByBlockId(c[":db/id"]))
                .sort((a, b) => a.order - b.order),
              heading: block[":block/heading"] || 0,
              open: block[":block/open"] || true,
              viewType: block[":children/view-type"]?.substring(1) as ViewType,
              editTime: new Date(block[":edit/time"] || 0),
              textAlign: block[":block/text-align"] || "left",
              props: {
                imageResize: Object.fromEntries(
                  Object.keys(props[":image-size"] || {}).map((p) => [
                    p,
                    {
                      height: props[":image-size"][p][":height"],
                      width: props[":image-size"][p][":width"],
                    },
                  ])
                ),
                iframe: Object.fromEntries(
                  Object.keys(props[":iframe"] || {}).map((p) => [
                    p,
                    {
                      height: props[":iframe"][p][":size"][":height"],
                      width: props[":iframe"][p][":size"][":width"],
                    },
                  ])
                ),
              },
            };
          };
          window.fixViewType = ({
            c,
            v,
          }: {
            c: TreeNode;
            v: ViewType;
          }): TreeNode => {
            if (!c.viewType) {
              c.viewType = v;
            }
            c.children.forEach((cc) =>
              window.fixViewType({ c: cc, v: c.viewType })
            );
            return c;
          };
          window.getTreeByPageName = (name: string): TreeNode[] => {
            const result = window.roamAlphaAPI.q(
              `[:find (pull ?e [:block/children :children/view-type]) :where [?e :node/title "${name
                .replace(/\\/, "\\\\")
                .replace(/"/g, '\\"')}"]]`
            );
            if (!result.length) {
              return [];
            }
            const block = result[0][0] as RoamBlock;
            const children = block?.children || [];
            const viewType = block?.["view-type"] || "bullet";
            return children
              .map((c) => window.getTreeByBlockId(c.id))
              .sort((a, b) => a.order - b.order)
              .map((c) => window.fixViewType({ c, v: viewType }));
          };
        });
        const configPage =
          allPageNames.find((c) => CONFIG_PAGE_NAMES.includes(c)) || "";
        const configPageTree = configPage
          ? await getParsedTree({
              evaluate: page.evaluate,
              pageName: configPage,
            })
          : [];
        const userConfig = getConfigFromPage(configPageTree);

        const config = {
          ...defaultConfig,
          ...userConfig,
          ...inputConfig,
        };
        config.files = await Promise.all(
          Object.entries(config.files).map(([u, uid]) =>
            page
              .evaluate(
                () =>
                  window.roamAlphaAPI.q(
                    `[:find (pull ?e [:block/string]) :where [?e :block/uid "${uid}"]]`
                  )?.[0]?.[0]?.string,
                uid
              )
              .then((url) => [u, UPLOAD_REGEX.exec(url)?.[1] || ""])
          )
        ).then((ents) => Object.fromEntries(ents));
        const blockReferences = config.plugins["inline-block-references"]
          ? await page.evaluate(() => {
              return window.roamAlphaAPI
                .q(
                  "[:find ?pu ?pt ?ru :where [?pp :node/title ?pt] [?p :block/page ?pp] [?p :block/uid ?pu] [?r :block/uid ?ru] [?p :block/refs ?r]]"
                )
                .reduce((cur, [uid, title, u]: string[]) => {
                  if (cur[u]) {
                    cur[u].push({ uid, title });
                  } else {
                    cur[u] = [{ uid, title }];
                  }
                  return cur;
                }, {} as { [uid: string]: { uid: string; title: string }[] });
            })
          : ({} as { [uid: string]: { uid: string; title: string }[] });
        pageReferences.current = await page
          .evaluate(() =>
            window.roamAlphaAPI.q(
              "[:find ?t ?title :where [?parent :node/title ?title] [?b :block/page ?parent] [?b :block/refs ?p] [?p :node/title ?t]]"
            )
          )
          .then((prs) =>
            prs.reduce(
              (prev, cur: string[]) => ({
                ...prev,
                [cur[0]]: [...(prev[cur[0]] || []), cur[1]],
              }),
              {} as { [p: string]: string[] }
            )
          );
        const getReferences = (t: TreeNode): HydratedTreeNode => ({
          ...t,
          references: blockReferences[t.uid] || [],
          children: t.children.map(getReferences),
        });

        const layouts = config.filter.map((f) => f.layout);
        const titleFilters = config.filter
          .map((f, layout) => ({ fcn: getTitleRuleFromNode(f), layout }))
          .filter((f) => !!f.fcn);
        const titleFilter = (t: string) =>
          !titleFilters.length || titleFilters.some((r) => r.fcn(t));

        info(`querying data ${new Date().toLocaleTimeString()}`);
        const pageNamesWithContent = await Promise.all(
          allPageNames
            .filter(
              (pageName) => pageName === config.index || titleFilter(pageName)
            )
            .filter((pageName) => !CONFIG_PAGE_NAMES.includes(pageName))
            .map((pageName) => {
              if (debug) {
                info(`Getting parsed tree for page ${pageName}`);
              }
              return getParsedTree({ evaluate: page.evaluate, pageName }).then(
                (content) => ({
                  pageName,
                  content,
                  layout: titleFilters.find((r) => r.fcn(pageName))?.layout,
                })
              );
            })
        );
        info(
          `title filtered to ${
            pageNamesWithContent.length
          } pages ${new Date().toLocaleTimeString()}`
        );
        const entries = await Promise.all(
          pageNamesWithContent.map(({ pageName, content, layout }) => {
            return Promise.all([
              page.evaluate(
                (pageName: string) =>
                  window.roamAlphaAPI
                    .q(
                      `[:find ?rt ?r :where [?pr :node/title ?rt] [?r :block/page ?pr] [?r :block/refs ?p] [?p :node/title "${pageName
                        .replace(/\\/, "\\\\")
                        .replace(/"/g, '\\"')}"]]`
                    )
                    .map((args) => ({
                      title: args[0] as string,
                      node: window.fixViewType({
                        c: window.getTreeByBlockId(args[1] as number),
                        v: "bullet",
                      }),
                    })),
                pageName
              ),
              page.evaluate(
                (pageName) =>
                  (window.roamAlphaAPI.q(
                    `[:find ?v :where [?e :children/view-type ?v] [?e :node/title "${pageName
                      .replace(/\\/, "\\\\")
                      .replace(/"/g, '\\"')}"]]`
                  )?.[0]?.[0] as ViewType) || "bullet",
                pageName
              ),
              page.evaluate(
                (pageName) =>
                  (window.roamAlphaAPI.q(
                    `[:find ?u :where [?e :block/uid ?u] [?e :node/title "${pageName
                      .replace(/\\/, "\\\\")
                      .replace(/"/g, '\\"')}"]]`
                  )?.[0]?.[0] as ViewType) || "bullet",
                pageName
              ),
            ])
              .then(([references, viewType, uid]) => ({
                references: references.map((r) => ({
                  ...r,
                  node: getReferences(r.node),
                })),
                pageName,
                content: content.map(getReferences),
                viewType,
                uid,
                layout,
              }))
              .catch((e) => {
                console.error("Failed to find references for page", pageName);
                throw new Error(e);
              });
          })
        );
        info(
          `content filtered to ${
            entries.length
          } entries ${new Date().toLocaleTimeString()}`
        );
        const pages = Object.fromEntries(
          entries.map(({ content, pageName, ...props }) => {
            const allBlocks = content.flatMap(allBlockMapper);
            const titleMatch = allBlocks
              .find((s) => TITLE_REGEX.test(s.text))
              ?.text?.match?.(TITLE_REGEX);
            const headMatch = allBlocks
              .find((s) => HEAD_REGEX.test(s.text))
              ?.children?.[0]?.text?.match?.(HTML_REGEX);
            const title = titleMatch ? titleMatch[1].trim() : pageName;
            const head = headMatch ? headMatch[1] : "";
            const metadata = Object.fromEntries(
              allBlocks
                .filter((s) => METADATA_REGEX.test(s.text))
                .map((node) => ({
                  match: node.text.match(METADATA_REGEX),
                  node,
                }))
                .filter(({ match }) => !!match && match.length >= 3)
                .map(({ match, node }) => ({
                  key: match[1],
                  value: match[2].trim() || node.children[0]?.text || "",
                }))
                .map(({ key, value }) => [key, extractTag(value.trim())])
                .concat([["name", title.split("/").slice(-1)[0]]])
            );
            return [
              pageName,
              {
                content,
                head,
                metadata,
                ...props,
              },
            ];
          })
        );
        await page.close();
        browser.close();
        return { pages, outputPath, config, layouts };
      } catch (e) {
        await page.screenshot({ path: path.join(pathRoot, "error.png") });
        error("took screenshot");
        throw new Error(e);
      }
    })
    .then((d) => processSiteData({ ...d, info }))
    .catch((e) => {
      error(e.message);
      throw new Error(e);
    });
};

export default run;

// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html#invalidation-specifying-objects
const INVALIDATION_MAX = 1499;

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const s3 = new AWS.S3({ apiVersion: "2006-03-01", credentials });

const getDistributionIdByDomain = async (domain: string) => {
  let finished = false;
  let Marker: string = undefined;
  while (!finished) {
    const {
      DistributionList: { IsTruncated, NextMarker, Items },
    } = await cloudfront.listDistributions({ Marker }).promise();
    const distribution = Items.find((i) => i.Aliases.Items.includes(domain));
    if (distribution) {
      return distribution.Id;
    }
    finished = !IsTruncated;
    Marker = NextMarker;
  }

  return null;
};

const waitForCloudfront = (props: {
  trial?: number;
  Id: string;
  DistributionId: string;
  resolve: (s: string) => void;
}) => {
  const { trial = 0, resolve, ...args } = props;
  cloudfront
    .getInvalidation(args)
    .promise()
    .then((r) => r.Invalidation.Status)
    .then((status) => {
      if (status === "Completed") {
        resolve("Done!");
      } else if (trial === 100) {
        resolve("Ran out of time waiting for cloudfront...");
      } else {
        console.log(
          "Still waiting for invalidation. Found",
          status,
          "on trial",
          trial
        );
        setTimeout(
          () => waitForCloudfront({ ...args, trial: trial + 1, resolve }),
          5000
        );
      }
    });
};

export const readDir = (s: string): string[] =>
  fs
    .readdirSync(s, { withFileTypes: true })
    .flatMap((f) =>
      f.isDirectory() ? readDir(path.join(s, f.name)) : [path.join(s, f.name)]
    );

export const handler = async (event: {
  roamGraph: string;
  key?: string;
  debug?: boolean;
}): Promise<void> => {
  const logStatus = createLogStatus(event.roamGraph, "deploy");
  const outputPath =
  process.env.NODE_ENV === "production"
    ? path.join("/tmp", event.roamGraph)
    : path.resolve("dist");
  if (!event.key) {
    console.warn("Daily deploys deprecated - `key` is required");
    await logStatus("SUCCESS");
    return;
  }

  await logStatus("BUILDING SITE");
  return s3
    .getObject({ Bucket: "roamjs-static-site-data", Key: event.key })
    .promise()
    .then((data) => {
      const { pages, config } = JSON.parse(data.Body.toString());
      fs.mkdirSync(outputPath, { recursive: true });
      return processSiteData({
        pages,
        config: {
          ...defaultConfig,
          ...config,
        },
        outputPath,
        info: console.log,
      });
    })
    .then(async () => {
      await logStatus("DELETING STALE FILES");
      const Bucket = `roamjs-static-sites`;
      const Prefix = `${event.roamGraph}/`;
      const outputPathRegex = new RegExp(`^${outputPath.replace(/\\/g, "\\\\")}`);
      const filesToUpload = readDir(outputPath).map((s) =>
        s
          .replace(outputPathRegex, "")
          .replace(/^(\/|\\)/, "")
          .replace(/\\/g, "/")
      );

      const fileSet = new Set(filesToUpload);
      const eTags: { [key: string]: string } = {};
      const keysToDelete = new Set<string>();
      let finished = false;
      let ContinuationToken: string = undefined;
      while (!finished) {
        const { Contents, IsTruncated, NextContinuationToken } = await s3
          .listObjectsV2({ Bucket, ContinuationToken, Prefix })
          .promise();
        Contents.map(({ Key, ETag }) => {
          eTags[Key.substring(Prefix.length)] = ETag;
          return Key;
        })
          .filter((k) => !fileSet.has(k.substring(Prefix.length)))
          .forEach((k) => keysToDelete.add(k));
        finished = !IsTruncated;
        ContinuationToken = NextContinuationToken;
      }
      const filesToInvalidate = new Set<string>(keysToDelete);
      if (keysToDelete.size) {
        console.log("Files to Delete", keysToDelete.size);
        const DeleteObjects = Array.from(keysToDelete).map((Key) => ({ Key }));
        for (let i = 0; i < DeleteObjects.length; i += 1000) {
          await s3
            .deleteObjects({
              Bucket,
              Delete: { Objects: DeleteObjects.slice(i, i + 1000) },
            })
            .promise();
        }
      }

      await logStatus("UPLOADING");
      console.log("Files to Upload", filesToUpload.length);
      for (const key of filesToUpload) {
        const Body = fs.createReadStream(path.join(outputPath, key));
        const Key = `${Prefix}${key}`;
        const justType = mime.lookup(Key);
        const ContentType =
          justType && justType === "text/html"
            ? "text/html;charset=UTF-8"
            : justType || "text/plain";
        const { ETag } = await s3
          .upload({ Bucket, Key, Body, ContentType })
          .promise();
        if (eTags[key] && ETag !== eTags[key]) {
          filesToInvalidate.add(key);
        }
      }

      console.log("Files to Invalidate", filesToInvalidate.size);
      await logStatus("INVALIDATING CACHE");
      const DistributionId = await getDistributionIdByDomain(
        await getStackParameter("DomainName", graphToStackName(event.roamGraph))
      );
      if (DistributionId) {
        const invalidatingItems =
          filesToInvalidate.size === filesToUpload.length
            ? ["*"]
            : Array.from(filesToInvalidate);
        for (let i = 0; i < invalidatingItems.length; i += INVALIDATION_MAX) {
          const Items = invalidatingItems
            .slice(i, i + INVALIDATION_MAX)
            .flatMap((k) =>
              k === "index.html"
                ? ["/", "/index.html"]
                : [`/${k.replace(/\.html$/, "")}`, `/${k}`]
            );
          await cloudfront
            .createInvalidation({
              DistributionId,
              InvalidationBatch: {
                CallerReference: new Date().toJSON(),
                Paths: {
                  Quantity: Items.length,
                  Items,
                },
              },
            })
            .promise()
            .then(
              (r) =>
                new Promise<string>((resolve) =>
                  waitForCloudfront({
                    Id: r.Invalidation.Id,
                    DistributionId,
                    resolve,
                  })
                )
            )
            .catch((e) => {
              console.error(
                "Failed to invalidate these paths:\n[\n   ",
                Items.join(",\n    "),
                "\n]"
              );
              console.error(e);
            });
        }
      }
      await logStatus("SUCCESS");
    })
    .catch(async (e) => {
      console.error(e);
      await logStatus("FAILURE", JSON.stringify({ message: e.message }));
    });
};
