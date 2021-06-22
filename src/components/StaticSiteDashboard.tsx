import {
  Alert,
  Button,
  IAlertProps,
  Icon,
  InputGroup,
  Intent,
  Label,
  ProgressBar,
  Spinner,
  Switch,
  Tab,
  Tabs,
  Tooltip,
} from "@blueprintjs/core";
import { Controlled as CodeMirror } from "react-codemirror2";
import "codemirror/mode/xml/xml";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  extractTag,
  getAllPageNames,
  getTreeByBlockUid,
  getTreeByPageName,
  createBlock,
  TextNode,
  TreeNode,
  getPageTitlesAndBlockUidsReferencingPage,
  getPageViewType,
  getShallowTreeByParentUid,
  deleteBlock,
} from "roam-client";
import {
  Description,
  MenuItemSelect,
  PageInput,
  idToTitle,
  setInputSetting,
  setInputSettings,
  toFlexRegex,
  useServiceField,
  useServiceFieldVals,
  SERVICE_GUIDE_HIGHLIGHT,
  useServiceIsFieldSet,
  WrapServiceMainStage,
  ServiceNextButton,
  ServiceDashboard,
  StageContent,
  StageProps,
  SERVICE_TOKEN_STAGE,
  useAuthenticatedGet,
  useAuthenticatedPost,
  useServiceNextStage,
  useServicePageUid,
} from "roamjs-components";

const allBlockMapper = (t: TreeNode): TreeNode[] => [
  t,
  ...t.children.flatMap(allBlockMapper),
];

const RequestShareContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [ready, setReady] = useState(useServiceIsFieldSet("share"));
  const [deploySwitch, setDeploySwitch] = useState(
    !ready || useServiceField("share") === "true"
  );
  const onSwitchChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) =>
      setDeploySwitch((e.target as HTMLInputElement).checked),
    [setDeploySwitch]
  );
  const shareListener = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "DIV" &&
        target.parentElement.className.includes("bp3-menu-item") &&
        target.innerText.toUpperCase() === "SETTINGS"
      ) {
        document.removeEventListener("click", shareListener);
        const shareItem = target.parentElement as HTMLAnchorElement;
        shareItem.style.border = "unset";
        setTimeout(() => {
          const sharingTab = document.getElementById(
            "bp3-tab-title_rm-settings-tabs_rm-sharing-tab"
          );
          sharingTab.style.border = SERVICE_GUIDE_HIGHLIGHT;
          sharingTab.addEventListener(
            "click",
            () => {
              sharingTab.style.border = "unset";
              setTimeout(() => {
                if (
                  Array.from(
                    document.querySelectorAll<HTMLDivElement>(
                      ".rm-settings-user-permissions>div:first-child"
                    )
                  ).some((e) => e.innerText === "support@roamjs.com")
                ) {
                  setReady(true);
                  return;
                }
                const input = Array.from(
                  document.getElementsByTagName("input")
                ).find((i) => i.placeholder.includes("Enter email"));
                if (input) {
                  input.parentElement.parentElement.style.border =
                    SERVICE_GUIDE_HIGHLIGHT;
                  const container = input.parentElement?.parentElement;
                  if (container) {
                    const perm =
                      input.parentElement.parentElement.getElementsByClassName(
                        "rm-settings__permissions-button"
                      )?.[0] as HTMLButtonElement;
                    perm?.click?.();
                    setTimeout(() => {
                      const access = Array.from(
                        document.getElementsByClassName("bp3-menu-item")
                      )
                        .map((i) => i as HTMLAnchorElement)
                        .find(
                          (i) =>
                            (i as HTMLAnchorElement).innerText === "read access"
                        );
                      access?.click?.();
                    }, 1);
                  }
                  input.addEventListener("keydown", (e) => {
                    if (
                      e.key === "Enter" &&
                      (e.target as HTMLInputElement).value ===
                        "support@roamjs.com"
                    ) {
                      setReady(true);
                    }
                  });
                }
              }, 500);
            },
            { once: true }
          );
        }, 500);
      }
    },
    [setReady]
  );
  useEffect(() => {
    if (!ready) {
      const topbar = document.getElementsByClassName("rm-topbar")[0];
      if (topbar) {
        const moreMenu = topbar.getElementsByClassName(
          "bp3-icon-more"
        )[0] as HTMLSpanElement;
        if (moreMenu) {
          moreMenu.style.border = SERVICE_GUIDE_HIGHLIGHT;
          moreMenu.addEventListener(
            "click",
            () => {
              moreMenu.style.border = "unset";
              setTimeout(() => {
                const menuItems = moreMenu.closest(
                  ".bp3-popover-target.bp3-popover-open"
                )?.nextElementSibling;
                if (menuItems) {
                  const shareItem = Array.from(
                    menuItems.getElementsByClassName("bp3-menu-item")
                  )
                    .map((e) => e as HTMLAnchorElement)
                    .find((e) => e.innerText === "Settings");
                  if (shareItem) {
                    shareItem.style.border = SERVICE_GUIDE_HIGHLIGHT;
                  }
                }
              }, 500);
              document.addEventListener("click", shareListener);
            },
            { once: true }
          );
          return () => {
            moreMenu.style.border = "unset";
            document.removeEventListener("click", shareListener);
          };
        }
      }
    }
  }, [ready, shareListener]);
  const onSubmit = useCallback(() => {
    setInputSetting({
      blockUid: pageUid,
      key: "Share",
      value: `${deploySwitch}`,
    });
    nextStage();
  }, [nextStage, pageUid, deploySwitch, ready]);
  return (
    <>
      <p>
        In order to have automatic daily deploys, share your graph with{" "}
        <code>support@roamjs.com</code> as a <b>Reader</b>.{" "}
        <span style={{ fontSize: 8 }}>
          Why do we need this?{" "}
          <Tooltip
            content={
              <span style={{ maxWidth: 400, display: "inline-block" }}>
                RoamJS needs to access your Roam data for automatic daily
                updates. Instead of trusting RoamJS with your password, we are
                asking for read only permission. We will only access data based
                on your soon to be configured filters for the purposes of
                deploying your site.
              </span>
            }
          >
            <Icon icon={"info-sign"} iconSize={8} intent={Intent.PRIMARY} />
          </Tooltip>
        </span>
      </p>
      <p>
        If you're not comfortable with giving the RoamJS user read access to
        your graph, you will need to toggle off daily deploys below.
      </p>
      <Switch
        checked={deploySwitch}
        onChange={onSwitchChange}
        labelElement={"Daily Deploys"}
      />
      <ServiceNextButton onClick={onSubmit} disabled={!ready && deploySwitch} />
    </>
  );
};

const SUBDOMAIN_REGEX = /^((?!-)[A-Za-z0-9-]{0,62}[A-Za-z0-9])$/;
const DOMAIN_REGEX =
  /^(\*\.)?(((?!-)[A-Za-z0-9-]{0,62}[A-Za-z0-9])\.)+((?!-)[A-Za-z0-9-]{1,62}[A-Za-z0-9])$/;
const RequestDomainContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [value, setValue] = useState(useServiceField("domain"));
  const [error, setError] = useState("");
  const [domainSwitch, setDomainSwitch] = useState(
    !value.endsWith(".roamjs.com")
  );
  const onSwitchChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const { checked } = e.target as HTMLInputElement;
      setDomainSwitch(checked);
      setValue(
        checked ? value.replace(".roamjs.com", "") : `${value}.roamjs.com`
      );
    },
    [setDomainSwitch, value]
  );
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setValue(
        `${e.target.value.toLowerCase()}${domainSwitch ? "" : ".roamjs.com"}`
      ),
    [setValue, domainSwitch]
  );
  const onBlur = useCallback(() => {
    if (domainSwitch && !DOMAIN_REGEX.test(value)) {
      return setError("Invalid domain. Try a .com!");
    } else if (
      !domainSwitch &&
      !SUBDOMAIN_REGEX.test(value.replace(".roamjs.com", ""))
    ) {
      return setError("Invalid subdomain. Remove the period");
    }
    return setError("");
  }, [value, domainSwitch]);
  const onFocus = useCallback(() => setError(""), [setError]);
  const onSubmit = useCallback(() => {
    setInputSetting({ blockUid: pageUid, key: "domain", value, index: 1 });
    nextStage();
  }, [value, nextStage, pageUid]);
  const disabled = !!error || !value;
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !disabled
      ) {
        onSubmit();
      }
    },
    [onSubmit]
  );
  return (
    <>
      <Switch
        checked={domainSwitch}
        onChange={onSwitchChange}
        labelElement={"Use Custom Domain"}
      />
      <Label>
        {domainSwitch ? "Custom Domain" : "RoamJS Subdomain"}
        <InputGroup
          value={domainSwitch ? value : value.replace(".roamjs.com", "")}
          onChange={onChange}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          rightElement={
            !domainSwitch && (
              <span
                style={{ opacity: 0.5, margin: 4, display: "inline-block" }}
              >
                .roamjs.com
              </span>
            )
          }
        />
        <span style={{ color: "darkred" }}>{error}</span>
      </Label>
      <ServiceNextButton onClick={onSubmit} disabled={disabled} />
    </>
  );
};

const RequestIndexContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [value, setValue] = useState(useServiceField("index"));
  const onSubmit = useCallback(() => {
    setInputSetting({ blockUid: pageUid, key: "index", value, index: 1 });
    nextStage();
  }, [value, nextStage]);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        onSubmit();
      }
    },
    [onSubmit]
  );
  return (
    <div onKeyDown={onKeyDown}>
      <Label>
        Website Index
        <Description
          description={
            "Choose the page from your Roam Graph that will serve as your home page"
          }
        />
        <PageInput value={value} setValue={setValue} />
      </Label>
      <ServiceNextButton onClick={onSubmit} disabled={!value} />
    </div>
  );
};

const RequestFiltersContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [filters, setFilters] = useState<(TextNode & { key: number })[]>(
    (
      getTreeByPageName("roam/js/static-site").find((t) =>
        /filter/i.test(t.text)
      )?.children || []
    ).map((t, key) => ({ ...t, key }))
  );
  const [key, setKey] = useState(filters.length);
  const onSubmit = useCallback(() => {
    const tree = getTreeByBlockUid(pageUid);
    const keyNode = tree.children.find((t) => /filter/i.test(t.text));
    if (keyNode) {
      keyNode.children.forEach(({ uid }) =>
        window.roamAlphaAPI.deleteBlock({ block: { uid } })
      );
      filters.forEach((node, order) =>
        createBlock({ node, order, parentUid: keyNode.uid })
      );
    } else if (!keyNode) {
      createBlock({
        node: { text: "Filter", children: filters },
        order: 2,
        parentUid: pageUid,
      });
    }
    nextStage();
  }, [filters, nextStage]);
  const onAddFilter = useCallback(() => {
    setFilters([
      ...filters,
      {
        text: "TAGGED WITH",
        children: [{ text: "Website", children: [] }],
        key,
      },
    ]);
    setKey(key + 1);
  }, [filters, setFilters, key, setKey]);
  return (
    <>
      <div style={{ margin: "16px 0" }}>
        <Label>
          Filters
          <Description
            description={
              "Add the filter criteria for specifying which pages in your graph will be included in your static site."
            }
          />
        </Label>
        {filters.map((f) => (
          <div
            key={f.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingRight: "25%",
              marginBottom: 16,
            }}
          >
            <MenuItemSelect
              items={["STARTS WITH", "TAGGED WITH"]}
              onItemSelect={(s) =>
                setFilters(
                  filters.map((filter) =>
                    f.key === filter.key ? { ...filter, text: s } : filter
                  )
                )
              }
              activeItem={f.text}
            />
            {f.text === "TAGGED WITH" ? (
              <PageInput
                value={f.children[0].text}
                setValue={(text) =>
                  setFilters(
                    filters.map((filter) =>
                      f.key === filter.key
                        ? {
                            ...filter,
                            children: [{ text, children: [] }],
                          }
                        : filter
                    )
                  )
                }
              />
            ) : (
              <InputGroup
                value={f.children[0].text}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFilters(
                    filters.map((filter) =>
                      f.key === filter.key
                        ? {
                            ...filter,
                            children: [{ text: e.target.value, children: [] }],
                          }
                        : filter
                    )
                  )
                }
              />
            )}
            <Button
              icon={"trash"}
              minimal
              onClick={() =>
                setFilters(filters.filter((filter) => filter.key !== f.key))
              }
            />
          </div>
        ))}
        <Button onClick={onAddFilter}>ADD FILTER</Button>
      </div>
      <div>
        <ServiceNextButton onClick={onSubmit} />
      </div>
    </>
  );
};

const getGraph = () =>
  new RegExp(`^#/app/(.*?)/page/`).exec(window.location.hash)[1];

const getLaunchBody = () => {
  const tree = getTreeByPageName("roam/js/static-site");
  return {
    graph: getGraph(),
    domain: tree.find((t) => /domain/i.test(t.text))?.children?.[0]?.text,
    autoDeploysEnabled: /true/i.test(
      tree.find((t) => /share/i.test(t.text))?.children?.[0]?.text
    ),
  };
};

type Filter = { rule: string; values: string[] };
const TITLE_REGEX = new RegExp(`roam/js/static-site/title::(.*)`);
const HEAD_REGEX = new RegExp(`roam/js/static-stite/head::`);
const DESCRIPTION_REGEX = new RegExp(`roam/js/static-site/title::(.*)`);
const HTML_REGEX = new RegExp("```html\n(.*)```", "s");
const getTitleRuleFromNode = ({ rule: text, values: children }: Filter) => {
  if (text.trim().toUpperCase() === "STARTS WITH" && children.length) {
    const tag = extractTag(children[0]);
    return (title: string) => {
      return title.startsWith(tag);
    };
  }
  return undefined;
};

const getContentRuleFromNode = ({ rule: text, values: children }: Filter) => {
  if (text.trim().toUpperCase() === "TAGGED WITH" && children.length) {
    const tag = extractTag(children[0]);
    const findTag = (content: TreeNode) =>
      content.text.includes(`#${tag}`) ||
      content.text.includes(`[[${tag}]]`) ||
      content.text.includes(`${tag}::`) ||
      content.children.some(findTag);
    return (content: TreeNode[]) => content.some(findTag);
  }
  return undefined;
};

type HydratedTreeNode = Omit<TreeNode, "children"> & {
  references: { title: string; uid: string }[];
  children: HydratedTreeNode[];
};

const getDeployBody = () => {
  const autoDeploysEnabled = /true/i.test(
    getTreeByPageName("roam/js/static-site").find((t) => /share/i.test(t.text))
      ?.children?.[0]?.text
  );
  if (autoDeploysEnabled) {
    return {};
  }
  const allPageNames = getAllPageNames();
  const configPageTree = getTreeByPageName("roam/js/static-site");
  const getConfigNode = (key: string) =>
    configPageTree.find(
      (n) => n.text.trim().toUpperCase() === key.toUpperCase()
    );
  const indexNode = getConfigNode("index");
  const filterNode = getConfigNode("filter");
  const templateNode = getConfigNode("template");
  const referenceTemplateNode = getConfigNode("reference template");
  const pluginsNode = getConfigNode("plugins");
  const themeNode = getConfigNode("theme");
  const getCode = (node?: TreeNode) =>
    (node?.children || [])
      .map((s) => s.text.match(HTML_REGEX))
      .find((s) => !!s)?.[1];
  const template = getCode(templateNode);
  const referenceTemplate = getCode(referenceTemplateNode);
  const withIndex = indexNode?.children?.length
    ? { index: extractTag(indexNode.children[0].text.trim()) }
    : {};
  const withFilter = filterNode?.children?.length
    ? {
        filter: filterNode.children.map((t) => ({
          rule: t.text,
          values: t.children.map((c) => c.text),
        })),
      }
    : {};
  const withTemplate = template
    ? {
        template,
      }
    : {};
  const withReferenceTemplate = referenceTemplate ? { referenceTemplate } : {};
  const withPlugins = pluginsNode?.children?.length
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

  const withTheme = themeNode?.children?.length
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

  const config = {
    index: "Website Index",
    filter: [] as Filter[],
    ...withIndex,
    ...withFilter,
    ...withTemplate,
    ...withReferenceTemplate,
    ...withPlugins,
    ...withTheme,
  };

  const titleFilters = config.filter.length
    ? config.filter.map(getTitleRuleFromNode).filter((f) => !!f)
    : [() => false];
  const contentFilters = config.filter
    .map(getContentRuleFromNode)
    .filter((f) => !!f);

  const titleFilter = (t: string) =>
    !titleFilters.length || titleFilters.some((r) => r && r(t));
  const contentFilter = (c: TreeNode[]) =>
    !contentFilters.length || contentFilters.some((r) => r && r(c));
  const blockReferences = config.plugins["inline-block-references"]
    ? window.roamAlphaAPI
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
        }, {} as { [uid: string]: { uid: string; title: string }[] })
    : {};
  const getReferences = (t: TreeNode): HydratedTreeNode => ({
    ...t,
    references: blockReferences[t.uid] || [],
    children: t.children.map(getReferences),
  });

  const pageNamesWithContent = allPageNames
    .filter((pageName) => pageName === config.index || titleFilter(pageName))
    .filter((pageName) => "roam/js/static-site" !== pageName)
    .map((pageName) => ({
      pageName,
      content: getTreeByPageName(pageName),
    }));
  const entries = pageNamesWithContent
    .filter(
      ({ pageName, content }) =>
        pageName === config.index || contentFilter(content)
    )
    .map(({ pageName, content }) => {
      const references = getPageTitlesAndBlockUidsReferencingPage(pageName).map(
        ({ title, uid }) => ({
          title,
          node: getReferences(getTreeByBlockUid(uid)),
        })
      );
      const viewType = getPageViewType(pageName);
      return {
        references,
        pageName,
        content: content.map(getReferences),
        viewType,
      };
    });
  const pages = Object.fromEntries(
    entries.map(({ content, pageName, references, viewType }) => {
      const allBlocks = content.flatMap(allBlockMapper);
      const titleMatch = allBlocks
        .find((s) => TITLE_REGEX.test(s.text))
        ?.text?.match?.(TITLE_REGEX);
      const headMatch = allBlocks
        .find((s) => HEAD_REGEX.test(s.text))
        ?.children?.[0]?.text?.match?.(HTML_REGEX);
      const descriptionMatch = allBlocks
        .find((s) => DESCRIPTION_REGEX.test(s.text))
        ?.text?.match?.(DESCRIPTION_REGEX);
      const title = titleMatch ? titleMatch[1].trim() : pageName;
      const head = headMatch ? headMatch[1] : "";
      const description = descriptionMatch ? descriptionMatch[1].trim() : "";
      return [
        pageName,
        {
          content,
          references,
          title,
          description,
          head,
          viewType,
        },
      ];
    })
  );
  return { data: JSON.stringify({ pages, config }) };
};

const getNameServers = (statusProps: string): string[] => {
  try {
    const { nameServers } = JSON.parse(statusProps);
    return nameServers || [];
  } catch {
    return [];
  }
};

type CfVariableDiff = {
  field: string;
  old: string;
  value: string;
  key: string;
};

const isWebsiteReady = (w: { status: string; deploys: { status: string }[] }) =>
  w.status === "LIVE" &&
  (!w.deploys.length || ["SUCCESS", "FAILURE"].includes(w.deploys[0].status));

const getStatusColor = (status: string) =>
  ["LIVE", "SUCCESS"].includes(status)
    ? "darkgreen"
    : status === "FAILURE"
    ? "darkred"
    : "goldenrod";

const progressTypeToIntent = (type: string) => {
  if (type === "LAUNCHING") {
    return Intent.PRIMARY;
  } else if (type === "SHUTTING DOWN") {
    return Intent.DANGER;
  } else if (type === "DEPLOYING") {
    return Intent.SUCCESS;
  } else if (type === "UPDATING") {
    return Intent.WARNING;
  } else {
    return Intent.NONE;
  }
};

const WebsiteButton: React.FunctionComponent<
  Pick<IAlertProps, "onConfirm"> & {
    disabled?: boolean;
    buttonText: string;
    intent: Intent;
  }
> = ({ children, onConfirm, disabled = false, buttonText, intent }) => {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), [setIsOpen]);
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  return (
    <>
      <Button
        style={{ marginRight: 32 }}
        disabled={disabled}
        onClick={open}
        intent={intent}
      >
        {buttonText}
      </Button>
      <Alert
        isOpen={isOpen}
        canOutsideClickCancel
        canEscapeKeyCancel
        onClose={close}
        cancelButtonText={"Cancel"}
        onConfirm={onConfirm}
        confirmButtonText={"Confirm"}
        style={{ maxWidth: 600, width: 600 }}
      >
        {children}
      </Alert>
    </>
  );
};

const LiveContent: StageContent = () => {
  const authenticatedAxiosGet = useAuthenticatedGet();
  const authenticatedAxiosPost = useAuthenticatedPost();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [statusProps, setStatusProps] = useState<string>();
  const [cfVariableDiffs, setCfVariableDiffs] = useState<CfVariableDiff[]>([]);
  const [status, setStatus] = useState<string>();
  const [deploys, setDeploys] = useState<
    { status: string; date: string; uuid: string }[]
  >([]);
  const [progress, setProgress] = useState(0);
  const [progressType, setProgressType] = useState("");
  const timeoutRef = useRef(0);

  const getWebsite = useCallback(
    () =>
      authenticatedAxiosGet(`website-status?graph=${getGraph()}`).then((r) => {
        if (r.data) {
          setStatusProps(r.data.statusProps);
          setStatus(r.data.status);
          setDeploys(r.data.deploys);
          setProgress(r.data.progress);
          if (!isWebsiteReady(r.data)) {
            setProgressType(r.data.progressType);
            timeoutRef.current = window.setTimeout(getWebsite, 5000);
          } else {
            setProgressType("");
            authenticatedAxiosGet(`website-variables?graph=${getGraph()}`)
              .then((r) => {
                const diffs = [];
                const tree = getTreeByPageName(`roam/js/static-site`);
                const newDomain = tree.find((t) =>
                  toFlexRegex("domain").test(t.text)
                )?.children?.[0]?.text;
                if (newDomain !== r.data.DomainName) {
                  diffs.push({
                    field: "Domain",
                    old: r.data.DomainName,
                    value: newDomain,
                    key: "DomainName",
                  });
                }
                const newIsCustomDomain = `${!newDomain.endsWith(
                  ".roamjs.com"
                )}`;
                if (newIsCustomDomain !== r.data.CustomDomain) {
                  diffs.push({
                    field: "Is Custom Domain",
                    old: r.data.CustomDomain,
                    value: newIsCustomDomain,
                    key: "CustomDomain",
                  });
                }
                setCfVariableDiffs(diffs);
              })
              .catch((e) => {
                console.error(e);
                setCfVariableDiffs([]);
              });
          }
        } else {
          setStatusProps("{}");
          setStatus("");
          setDeploys([]);
          setProgress(0);
          setProgressType("");
        }
      }),
    [
      setStatus,
      setDeploys,
      timeoutRef,
      setStatusProps,
      setProgressType,
      setProgress,
    ]
  );
  const wrapPost = useCallback(
    (path: string, getData: () => Record<string, unknown>) => {
      setError("");
      setLoading(true);
      return new Promise<Record<string, unknown>>((resolve, reject) =>
        setTimeout(() => {
          try {
            const data = getData();
            resolve(data);
          } catch (e) {
            reject(e);
          }
        }, 1)
      )
        .then((data) => authenticatedAxiosPost(path, data))
        .then(getWebsite)
        .catch((e) => setError(e.response?.data || e.message))
        .finally(() => setLoading(false));
    },
    [setError, setLoading, getWebsite, authenticatedAxiosPost]
  );
  const manualDeploy = useCallback(
    () => wrapPost("deploy", getDeployBody),
    [wrapPost]
  );
  const launchWebsite = useCallback(
    () =>
      wrapPost("launch-website", getLaunchBody).then(() =>
        authenticatedAxiosPost("deploy", getDeployBody())
      ),
    [wrapPost]
  );
  const shutdownWebsite = useCallback(
    () =>
      wrapPost("shutdown-website", () => ({
        graph: getGraph(),
      })),
    [wrapPost]
  );
  const updateSite = useCallback(
    () =>
      wrapPost("update-website", () => ({
        graph: getGraph(),
        diffs: cfVariableDiffs,
      })),
    [wrapPost, cfVariableDiffs]
  );

  useEffect(() => () => clearTimeout(timeoutRef.current), [timeoutRef]);
  const siteDeploying = loading || !isWebsiteReady({ status, deploys });
  useEffect(() => {
    setLoading(true);
    getWebsite()
      .then(() => setInitialLoad(false))
      .catch((e) => setError(e.response?.data || e.message))
      .finally(() => setLoading(false));
  }, [setError, setLoading, setInitialLoad, getWebsite]);
  return (
    <>
      {loading && <Spinner />}
      {error && <div style={{ color: "darkred" }}>{error}</div>}
      {!initialLoad && (
        <>
          {status ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <span>Status</span>
                {status === "AWAITING VALIDATION" &&
                statusProps &&
                statusProps !== "{}" ? (
                  <div style={{ color: "darkblue" }}>
                    <span>{status}</span>
                    <br />
                    To continue, add the following Name Servers to your Domain
                    Management Settings:
                    <ul>
                      {getNameServers(statusProps).map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <span
                    style={{ marginLeft: 16, color: getStatusColor(status) }}
                  >
                    {status === "LIVE" ? (
                      <a
                        href={`https://${
                          getTreeByPageName(`roam/js/static-site`).find((t) =>
                            toFlexRegex("domain").test(t.text)
                          )?.children?.[0]?.text
                        }`}
                        target="_blank"
                        rel="noopener"
                        style={{ color: "inherit" }}
                      >
                        LIVE
                      </a>
                    ) : (
                      status
                    )}
                  </span>
                )}
              </div>
              {progressType && (
                <div style={{ margin: "8px 0" }}>
                  <ProgressBar
                    value={progress}
                    intent={progressTypeToIntent(progressType)}
                  />
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                {!!cfVariableDiffs.length && (
                  <WebsiteButton
                    onConfirm={updateSite}
                    disabled={siteDeploying}
                    buttonText={"Update Site"}
                    intent={Intent.WARNING}
                  >
                    <p>A site update would make the following changes:</p>
                    <table>
                      <tbody>
                        {cfVariableDiffs.map((diff) => (
                          <tr key={diff.field}>
                            <td>
                              <b>Field: </b>
                              {diff.field}
                            </td>
                            <td>
                              <b>From: </b>
                              {diff.old}
                            </td>
                            <td>
                              <Icon icon={"arrow-right"} />
                            </td>
                            <td>
                              <b>To: </b>
                              {diff.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ marginTop: 10 }}>
                      Are you sure you want to make these changes? This
                      operation could take several minutes.
                    </p>
                  </WebsiteButton>
                )}
                <Button
                  style={{ marginRight: 32 }}
                  disabled={siteDeploying}
                  onClick={manualDeploy}
                  intent={Intent.PRIMARY}
                >
                  Manual Deploy
                </Button>
                <WebsiteButton
                  disabled={siteDeploying}
                  onConfirm={shutdownWebsite}
                  buttonText={"Shutdown"}
                  intent={Intent.DANGER}
                >
                  <p>
                    Are you sure you want to shut down this RoamJS website? This
                    operation is irreversible.
                  </p>
                </WebsiteButton>
              </div>
              <hr style={{ margin: "16px 0" }} />
              <h6>Deploys</h6>
              <ul>
                {deploys.map((d) => (
                  <div key={d.uuid}>
                    <span style={{ display: "inline-block", minWidth: "30%" }}>
                      At {new Date(d.date).toLocaleString()}
                    </span>
                    <span
                      style={{
                        marginLeft: 16,
                        color: getStatusColor(d.status),
                      }}
                    >
                      {d.status}
                    </span>
                  </div>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>
                You're ready to launch your new site! Click the button below to
                start.
              </p>
              <Button
                disabled={loading}
                onClick={launchWebsite}
                intent={Intent.PRIMARY}
                style={{ maxWidth: 240 }}
              >
                LAUNCH
              </Button>
            </>
          )}
        </>
      )}
    </>
  );
};

const RequestHtmlContent = ({
  openPanel,
  field,
  defaultValue,
  description,
}: Pick<StageProps, "openPanel"> & {
  field: string;
  defaultValue: string;
  description: string;
}) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [value, setValue] = useState(
    useServiceField(field).match(HTML_REGEX)?.[1] || defaultValue
  );
  const onBeforeChange = useCallback(
    (_, __, value) => setValue(value),
    [setValue]
  );
  const onSubmit = useCallback(() => {
    setInputSetting({
      blockUid: pageUid,
      key: field,
      value: `\`\`\`html\n${value}\`\`\``,
      index: 1,
    });
    nextStage();
  }, [value, nextStage, field, pageUid]);
  return (
    <div>
      <Label>
        {field.substring(0, 1).toUpperCase()}
        {field.substring(1)}
        <Description description={description} />
        <div style={{ border: "1px solid lightgray" }}>
          <CodeMirror
            value={value}
            options={{
              mode: { name: "xml", htmlMode: true },
              lineNumbers: true,
              lineWrapping: true,
            }}
            onBeforeChange={onBeforeChange}
          />
          <Button
            icon={"reset"}
            onClick={() => setValue(defaultValue)}
            minimal
          />
        </div>
      </Label>
      <ServiceNextButton onClick={onSubmit} disabled={!value} />
    </div>
  );
};

const DEFAULT_TEMPLATE = `<!doctype html>
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
</html>`;

const RequestTemplateContent: StageContent = ({ openPanel }) => {
  return (
    <RequestHtmlContent
      openPanel={openPanel}
      field={"template"}
      defaultValue={DEFAULT_TEMPLATE}
      description={"The template used for each webpage"}
    />
  );
};

const DEFAULT_REFERENCE_TEMPLATE = `<li>
  <a href="\${LINK}">
    \${REFERENCE}  
  </a>
</li>`;

const RequestReferenceTemplateContent: StageContent = ({ openPanel }) => {
  return (
    <RequestHtmlContent
      openPanel={openPanel}
      field={"reference template"}
      defaultValue={DEFAULT_REFERENCE_TEMPLATE}
      description={"The template used for each linked reference on a page."}
    />
  );
};

const supportedPlugins = ["inline-block-references", "header"];
const RequestPluginsContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [values, setValues] = useState(useServiceFieldVals("plugins"));
  const onSubmit = useCallback(() => {
    setInputSettings({
      blockUid: pageUid,
      key: "plugins",
      values,
      index: 1,
    });
    nextStage();
  }, [values, nextStage, pageUid]);
  return (
    <div>
      <Label>
        Plugins
        <Description
          description={
            "Enable any of the following plugins to include extra features on your static site!"
          }
        />
        {supportedPlugins.map((p) => (
          <Switch
            key={p}
            label={idToTitle(p)}
            checked={values.includes(p)}
            onChange={(e) => {
              const checked = (e.target as HTMLInputElement).checked;
              if (checked) {
                setValues([...values, p]);
              } else {
                setValues(values.filter((v) => v !== p));
              }
            }}
          />
        ))}
      </Label>
      <ServiceNextButton onClick={onSubmit} />
    </div>
  );
};

const tabIds = {
  text: ["font"],
  layout: ["width"],
};

const RequestThemeContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const themeUid = useMemo(
    () =>
      getShallowTreeByParentUid(pageUid).find((t) =>
        toFlexRegex("theme").test(t.text)
      )?.uid ||
      createBlock({ parentUid: pageUid, node: { text: "theme" }, order: 1 }),
    [pageUid]
  );
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const outerKeys = useMemo(
    () => Object.keys(tabIds) as (keyof typeof tabIds)[],
    []
  );
  const [outerKey, setOuterKey] = useState(outerKeys[0]);
  const innerKeys = useMemo(() => tabIds[outerKey], [outerKey]);
  const [innerKey, setInnerKey] = useState(innerKeys[0]);
  const onSubmit = useCallback(() => {
    getShallowTreeByParentUid(themeUid).forEach(({ uid }) => deleteBlock(uid));
    Object.entries(values)
      .map(([k, m]) => ({
        text: k,
        children: Object.entries(m).map(([mk, v]) => ({
          text: mk,
          children: [{ text: v }],
        })),
      }))
      .forEach((node, order) =>
        createBlock({ parentUid: themeUid, node, order })
      );
    nextStage();
  }, [values, nextStage, themeUid]);
  return (
    <div>
      <Tabs
        vertical
        onChange={(k) => setOuterKey(k as keyof typeof tabIds)}
        selectedTabId={outerKey}
      >
        {outerKeys.map((tabId) => (
          <Tab
            id={tabId}
            key={tabId}
            title={tabId}
            panel={
              <Tabs
                vertical
                onChange={(k) => setInnerKey(k as string)}
                selectedTabId={innerKey}
              >
                {innerKeys.map((tabId) => (
                  <Tab
                    id={tabId}
                    key={tabId}
                    title={tabId}
                    panel={
                      <Label>
                        {innerKey}
                        <InputGroup
                          value={values?.[outerKey]?.[innerKey] || ""}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [outerKey]: {
                                ...values[outerKey],
                                [innerKey]: e.target.value,
                              },
                            })
                          }
                        />
                      </Label>
                    }
                  />
                ))}
              </Tabs>
            }
          />
        ))}
      </Tabs>
      <ServiceNextButton onClick={onSubmit} />
    </div>
  );
};

const StaticSiteDashboard = (): React.ReactElement => (
  <ServiceDashboard
    service={"static-site"}
    stages={[
      SERVICE_TOKEN_STAGE,
      {
        component: RequestShareContent,
        setting: "Share",
      },
      {
        component: RequestDomainContent,
        setting: "Domain",
      },
      {
        component: RequestIndexContent,
        setting: "Index",
      },
      {
        component: RequestFiltersContent,
        setting: "Filter",
      },
      WrapServiceMainStage(LiveContent),
      {
        component: RequestTemplateContent,
        setting: "Template",
      },
      {
        component: RequestReferenceTemplateContent,
        setting: "Reference Template",
      },
      {
        component: RequestPluginsContent,
        setting: "Plugins",
      },
      {
        component: RequestThemeContent,
        setting: "Theme",
      },
    ]}
  />
);

export default StaticSiteDashboard;
