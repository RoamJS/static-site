import {
  Alert,
  Button,
  Classes,
  Dialog,
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
  getFirstChildTextByBlockUid,
  DAILY_NOTE_PAGE_TITLE_REGEX,
  getPageUidByPageTitle,
} from "roam-client";
import {
  Description,
  MenuItemSelect,
  PageInput,
  setInputSetting,
  toFlexRegex,
  useServiceField,
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

const FilterLayout = ({
  filterText,
  initialValue,
  saveValue,
}: {
  filterText: string;
  initialValue: string;
  saveValue: (s: string) => void;
}) => {
  const [filterLayoutOpen, setFilterLayoutOpen] = useState(false);
  const openFilterLayout = useCallback(
    () => setFilterLayoutOpen(true),
    [setFilterLayoutOpen]
  );
  const closeFilterLayout = useCallback(
    () => setFilterLayoutOpen(false),
    [setFilterLayoutOpen]
  );
  const [value, setValue] = useState(initialValue);
  const onBeforeChange = useCallback(
    (_, __, value) => setValue(value),
    [setValue]
  );
  return (
    <Tooltip>
      <Button icon={"layout-grid"} minimal onClick={openFilterLayout} />
      <Dialog isOpen={filterLayoutOpen} title={`Layout for ${filterText}`}>
        <div className={Classes.DIALOG_BODY}>
          <CodeMirror
            value={value}
            options={{
              mode: { name: "xml", htmlMode: true },
              lineNumbers: true,
              lineWrapping: true,
            }}
            onBeforeChange={onBeforeChange}
          />
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text={"Cancel"} onClick={closeFilterLayout} />
            <Button
              text={"Save"}
              onClick={() => {
                saveValue(value);
                closeFilterLayout();
              }}
            />
          </div>
        </div>
      </Dialog>
    </Tooltip>
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
        children: [
          {
            text: "Website",
            children: [{ text: "${PAGE_CONTENT}", children: [] }],
          },
        ],
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
              items={["STARTS WITH", "TAGGED WITH", "DAILY", "ALL"]}
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
                            children: [{ ...f.children[0], text }],
                          }
                        : filter
                    )
                  )
                }
              />
            ) : (
              f.text === "STARTS WITH" && (
                <InputGroup
                  value={f.children[0].text}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFilters(
                      filters.map((filter) =>
                        f.key === filter.key
                          ? {
                              ...filter,
                              children: [
                                { ...filter.children[0], text: e.target.value },
                              ],
                            }
                          : filter
                      )
                    )
                  }
                />
              )
            )}
            <FilterLayout
              filterText={`${f.text} ${f.children[0].text}`}
              initialValue={
                HTML_REGEX.exec(f.children[0]?.children?.[0]?.text)?.[1] ||
                "${PAGE_CONTENT}"
              }
              saveValue={(v) =>
                setFilters(
                  filters.map((filter) =>
                    f.key === filter.key
                      ? {
                          ...filter,
                          children: [
                            {
                              ...filter.children[0],
                              children: [
                                {
                                  text: `\`\`\`html\n${v}\`\`\``,
                                  children: [],
                                },
                              ],
                            },
                          ],
                        }
                      : filter
                  )
                )
              }
            />
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
  };
};

type Filter = { rule: string; values: string[]; layout: string };
const TITLE_REGEX = new RegExp(`roam/js/static-site/title::(.*)`);
const HEAD_REGEX = new RegExp(`roam/js/static-stite/head::`);
const DESCRIPTION_REGEX = new RegExp(`roam/js/static-site/title::(.*)`);
const METADATA_REGEX = /roam\/js\/static-site\/([a-z-]+)::(.*)/;
const HTML_REGEX = new RegExp("```html\n(.*)```", "s");
const pageReferences: { current: { [p: string]: string[] } } = { current: {} };
const getTitleRuleFromNode = ({ rule: text, values: children }: Filter) => {
  const ruleType = text.trim().toUpperCase();
  if (ruleType === "STARTS WITH" && children.length) {
    const tag = extractTag(children[0]);
    return (title: string) => {
      return title.startsWith(tag);
    };
  } else if (ruleType === "DAILY") {
    return (title: string) => DAILY_NOTE_PAGE_TITLE_REGEX.test(title);
  } else if (ruleType === "ALL") {
    return () => true;
  } else if (ruleType === "TAGGED WITH" && children.length) {
    const tag = extractTag(children[0]);
    const references = pageReferences.current[tag] || [];
    return (title: string) => !!references && references.includes(title);
  }
  return undefined;
};

type HydratedTreeNode = Omit<TreeNode, "children"> & {
  references: { title: string; uid: string }[];
  children: HydratedTreeNode[];
};

const getDeployBody = () => {
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
          layout: t.children[0]?.text,
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
  pageReferences.current = window.roamAlphaAPI
    .q(
      "[:find ?t ?title :where [?parent :node/title ?title] [?b :block/page ?parent] [?b :block/refs ?p] [?p :node/title ?t]]"
    )
    .reduce(
      (prev, cur: string[]) => ({
        ...prev,
        [cur[0]]: [...(prev[cur[0]] || []), cur[1]],
      }),
      {} as { [p: string]: string[] }
    );
  const layouts = config.filter.map((f) => f.layout);
  const titleFilters = config.filter
    .map((f, layout) => ({ fcn: getTitleRuleFromNode(f), layout }))
    .filter((f) => !!f.fcn);
  const titleFilter = (t: string) =>
    !titleFilters.length || titleFilters.some((r) => r.fcn(t));

  const blockReferences = config.plugins?.["inline-block-references"]
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
      layout: titleFilters.find((r) => r.fcn(pageName))?.layout,
    }));
  const entries = pageNamesWithContent.map(({ pageName, content, layout }) => {
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
      uid: getPageUidByPageTitle(pageName),
      layout,
    };
  });
  const pages = Object.fromEntries(
    entries.map(({ content, pageName, ...props }) => {
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
      );
      return [
        pageName,
        {
          content,
          title,
          description,
          head,
          metadata,
          ...props,
        },
      ];
    })
  );
  return { data: JSON.stringify({ pages, config, layouts }) };
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
                    {statusProps.includes("nameServers") && (
                      <>
                        To continue, add the following Name Servers to your
                        Domain Management Settings:
                        <ul>
                          {getNameServers(statusProps).map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {statusProps.includes("cname") && (
                      <>
                        To continue, add the following CNAME to your Domain
                        Management Settings:
                        <p>
                          <b>Name: </b>
                          {JSON.parse(statusProps).cname.name}
                        </p>
                        <p>
                          <b>Value: </b>
                          {JSON.parse(statusProps).cname.value}
                        </p>
                      </>
                    )}
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
                    <span style={{ display: "inline-block", minWidth: "35%" }}>
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
        <div
          style={{ border: "1px solid lightgray", position: "relative" }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <CodeMirror
            value={value}
            options={{
              mode: { name: "xml", htmlMode: true },
              lineNumbers: true,
              lineWrapping: true,
            }}
            onBeforeChange={onBeforeChange}
          />
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 2,
            }}
          >
            <Tooltip content={"Reset to default"}>
              <Button
                icon={"reset"}
                onClick={() => setValue(defaultValue)}
                minimal
              />
            </Tooltip>
          </div>
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

type PluginTab = { id: string; options: string[]; multi?: true };

type Plugin = {
  id: string;
  tabs: PluginTab[];
};

const pluginIds: Plugin[] = [
  { id: "header", tabs: [{ id: "links", options: ["{page}"], multi: true }] },
  { id: "image-preview", tabs: [] },
  { id: "inline-block-references", tabs: [] },
  { id: "paths", tabs: [{ id: "type", options: ["uid", "lowercase"] }] },
  {
    id: "sidebar",
    tabs: [
      {
        id: "widgets",
        options: ["graph"],
        multi: true,
      },
    ],
  },
  { id: "uid-paths", tabs: [] },
];
const pluginsById = Object.fromEntries(
  pluginIds.map(({ id, tabs }) => [
    id,
    Object.fromEntries(tabs.map(({ id, ...rest }) => [id, rest])),
  ])
);

const RequestPluginsContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const pluginUid = useMemo(
    () =>
      getShallowTreeByParentUid(pageUid).find((t) =>
        toFlexRegex("plugins").test(t.text)
      )?.uid ||
      createBlock({ parentUid: pageUid, node: { text: "plugins" }, order: 1 }),
    [pageUid]
  );
  const [values, setValues] = useState<
    Record<string, Record<string, string[]>>
  >(() =>
    pluginUid
      ? Object.fromEntries(
          getShallowTreeByParentUid(pluginUid).map(({ uid, text }) => [
            text,
            Object.fromEntries(
              getShallowTreeByParentUid(uid).map((c) => [
                c.text,
                getShallowTreeByParentUid(c.uid).map((t) => t.text),
              ])
            ),
          ])
        )
      : {}
  );
  const outerKeys = useMemo(() => pluginIds.map(({ id }) => id), []);
  const [outerKey, setOuterKey] = useState(outerKeys[0]);
  const outerTabSelected = useMemo(
    () => pluginIds.find(({ id }) => id === outerKey),
    [outerKey]
  );
  const [innerKey, setInnerKey] = useState(outerKey);
  const onSubmit = useCallback(() => {
    getShallowTreeByParentUid(pluginUid).forEach(({ uid }) => deleteBlock(uid));
    Object.entries(values)
      .map(([k, m]) => ({
        text: k,
        children: Object.entries(m).map(([mk, vs]) => ({
          text: mk,
          children: vs.map((v) => ({ text: v })),
        })),
      }))
      .forEach((node, order) =>
        createBlock({ parentUid: pluginUid, node, order })
      );
    nextStage();
  }, [values, nextStage, pageUid]);
  const [activeValue, setActiveValue] = useState("");
  return (
    <div>
      <Label>
        Plugins
        <Description
          description={
            "Enable any of the following plugins to include extra features on your static site!"
          }
        />
      </Label>
      <Tabs
        vertical
        onChange={(k) => {
          const t = k as string;
          setOuterKey(t);
          setInnerKey(t);
          setActiveValue("");
        }}
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
                onChange={(k) => {
                  setInnerKey(k as string);
                  setActiveValue("");
                }}
                selectedTabId={innerKey}
              >
                <Tab
                  id={tabId}
                  key={tabId}
                  title={"enabled"}
                  panel={
                    <Switch
                      label={"Enabled"}
                      checked={!!values[tabId]}
                      onChange={(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        if (checked) {
                          setValues({ ...values, [tabId]: {} });
                        } else {
                          const { [tabId]: _, ...rest } = values;
                          setValues(rest);
                        }
                      }}
                    />
                  }
                />
                {outerTabSelected.tabs.map(
                  ({ id: subtabId, options, multi }) => {
                    const onConfirm = () => {
                      const { [subtabId]: activeValues = [], ...rest } =
                        values[tabId];
                      setValues({
                        ...values,
                        [tabId]: {
                          ...rest,
                          [subtabId]: [...activeValues, activeValue],
                        },
                      });
                      setActiveValue("");
                    };
                    return (
                      <Tab
                        id={subtabId}
                        key={subtabId}
                        title={subtabId}
                        disabled={!values[tabId]}
                        panel={
                          <>
                            <Label>
                              {innerKey}
                              {options.includes("{page}") ? (
                                <PageInput
                                  value={activeValue}
                                  setValue={setActiveValue}
                                  showButton={multi}
                                  onConfirm={multi && onConfirm}
                                />
                              ) : options.length ? (
                                <div style={{ display: "flex" }}>
                                  <MenuItemSelect
                                    activeItem={activeValue}
                                    items={options.filter(
                                      (o) =>
                                        !(
                                          values[tabId]?.[subtabId] || []
                                        ).includes(o)
                                    )}
                                    onItemSelect={(e) => {
                                      setActiveValue(e);
                                      if (!multi) {
                                        setValues({
                                          ...values,
                                          [tabId]: {
                                            ...values[tabId],
                                            [subtabId]: [e],
                                          },
                                        });
                                      }
                                    }}
                                  />
                                  {multi && (
                                    <Button
                                      icon={"add"}
                                      minimal
                                      onClick={onConfirm}
                                    />
                                  )}
                                </div>
                              ) : (
                                <InputGroup
                                  value={activeValue}
                                  onChange={(e) =>
                                    setActiveValue(e.target.value)
                                  }
                                  rightElement={
                                    multi && (
                                      <Button
                                        icon={"add"}
                                        minimal
                                        onClick={onConfirm}
                                      />
                                    )
                                  }
                                />
                              )}
                            </Label>
                            {multi && (
                              <ul style={{ listStyle: "none", paddingLeft: 4 }}>
                                {(values[tabId]?.[subtabId] || []).map((p) => (
                                  <li
                                    key={p}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    }}
                                  >
                                    <span>{p}</span>
                                    <Button
                                      icon={"trash"}
                                      minimal
                                      onClick={() =>
                                        setValues({
                                          ...values,
                                          [tabId]: {
                                            ...values[tabId],
                                            [subtabId]: values[tabId][
                                              subtabId
                                            ].filter((v) => v !== p),
                                          },
                                        })
                                      }
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        }
                      />
                    );
                  }
                )}
              </Tabs>
            }
          />
        ))}
      </Tabs>
      <div style={{ marginTop: 16 }} />
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
    () =>
      themeUid
        ? Object.fromEntries(
            getShallowTreeByParentUid(themeUid).map(({ uid, text }) => [
              text,
              Object.fromEntries(
                getShallowTreeByParentUid(uid).map((c) => [
                  c.text,
                  getFirstChildTextByBlockUid(c.uid),
                ])
              ),
            ])
          )
        : {}
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
      <Label>
        Theme
        <Description
          description={"Configure the look and feel of your static site!"}
        />
      </Label>
      <Tabs
        vertical
        onChange={(k) => {
          const t = k as keyof typeof tabIds;
          setOuterKey(t);
          setInnerKey(tabIds[t][0]);
        }}
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
                {innerKeys.map((subtabId) => (
                  <Tab
                    id={subtabId}
                    key={subtabId}
                    title={subtabId}
                    panel={
                      <Label>
                        {subtabId}
                        <InputGroup
                          value={values?.[tabId]?.[subtabId] || ""}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [tabId]: {
                                ...values[tabId],
                                [subtabId]: e.target.value,
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
        component: RequestThemeContent,
        setting: "Theme",
      },
      {
        component: RequestPluginsContent,
        setting: "Plugins",
      },
      {
        component: RequestTemplateContent,
        setting: "Template",
      },
      {
        component: RequestReferenceTemplateContent,
        setting: "Reference Template",
      },
    ]}
  />
);

export default StaticSiteDashboard;
