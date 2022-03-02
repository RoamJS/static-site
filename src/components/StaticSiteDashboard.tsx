import {
  Alert,
  Button,
  Checkbox,
  Classes,
  Dialog,
  IAlertProps,
  Icon,
  InputGroup,
  Intent,
  Label,
  ProgressBar,
  Radio,
  RadioGroup,
  Spinner,
  Switch,
  Tab,
  TabId,
  Tabs,
  TextArea,
  Tooltip,
} from "@blueprintjs/core";
import { Controlled as CodeMirror } from "react-codemirror2";
import "codemirror/mode/xml/xml";
import "codemirror/mode/css/css";
import "codemirror/mode/javascript/javascript";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import BlockInput from "roamjs-components/components/BlockInput";
import Description from "roamjs-components/components/Description";
import MenuItemSelect from "roamjs-components/components/MenuItemSelect";
import PageInput from "roamjs-components/components/PageInput";
import useRoamJSTokenWarning from "roamjs-components/hooks/useRoamJSTokenWarning";
import useSubTree from "roamjs-components/hooks/useSubTree";
import extractRef from "roamjs-components/util/extractRef";
import extractTag from "roamjs-components/util/extractTag";
import setInputSetting from "roamjs-components/util/setInputSetting";
import toFlexRegex from "roamjs-components/util/toFlexRegex";
import getSettingValueFromTree from "roamjs-components/util/getSettingValueFromTree";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getShallowTreeByParentUid from "roamjs-components/queries/getShallowTreeByParentUid";
import { DAILY_NOTE_PAGE_TITLE_REGEX } from "roamjs-components/date/constants";
import createBlock from "roamjs-components/writes/createBlock";
import createPage from "roamjs-components/writes/createPage";
import type {
  TreeNode,
  InputTextNode,
  RoamBasicNode,
} from "roamjs-components/types";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import {
  // TODO split these out or delete
  useField as useServiceField,
  MainStage as WrapServiceMainStage,
  NextButton as ServiceNextButton,
  ServiceDashboard,
  StageContent,
  StageProps,
  useNextStage as useServiceNextStage,
  usePageUid as useServicePageUid,
  usePageUid,
} from "roamjs-components/components/ServiceComponents";
import { DEFAULT_TEMPLATE } from "../../lambdas/common/constants";
import apiGet from "roamjs-components/util/apiGet";
import apiPost from "roamjs-components/util/apiPost";
import axios, { AxiosError } from "axios";
import getAuthorizationHeader from "roamjs-components/util/getAuthorizationHeader";

const allBlockMapper = (t: TreeNode): TreeNode[] => [
  t,
  ...(t.children || []).flatMap(allBlockMapper),
];
const IGNORE_BLOCKS = `roam/js/static-site/ignore`;

const CSS_REGEX = new RegExp("```css\n(.*)```", "s");
const SUBDOMAIN_REGEX = /^((?!-)[A-Za-z0-9-]{0,62}[A-Za-z0-9])$/;
const UPLOAD_REGEX = /(https?:\/\/[^\)]*)(?:$|\)|\s)/;
const DOMAIN_REGEX =
  /^(\*\.)?(((?!-)[A-Za-z0-9-]{0,62}[A-Za-z0-9])\.)+((?!-)[A-Za-z0-9-]{1,62}[A-Za-z0-9])$/;
const IMAGE_REGEX = /^!\[\]\(([^)]+)\)$/;

const RequestSubscriptionContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const onNext = useCallback(() => {
    setInputSetting({
      blockUid: pageUid,
      key: "subscribed",
      value: "",
      index: 1,
    });
    nextStage();
  }, [nextStage, pageUid]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [productDescription, setProductDescription] = useState("");
  const [pricingMessage, setPricingMessage] = useState("");
  const dev = useMemo(
    () => (process.env.API_URL.includes("dev") ? "&dev=true" : ""),
    []
  );

  const intervalListener = useRef(0);
  const catchError = useCallback(
    (e: AxiosError) =>
      setError(e.response?.data?.message || e.response?.data || e.message),
    [setError]
  );
  useEffect(() => {
    Promise.all([
      axios
        .get(`https://lambda.roamjs.com/price?extensionId=static-site${dev}`, {
          headers: { Authorization: getAuthorizationHeader() },
        })
        .then((r) => {
          setPricingMessage(
            `$${r.data.price / 100}${r.data.perUse ? " per use" : ""}${
              r.data.isMonthly ? " per month" : " per year"
            }`
          );
          setProductDescription(r.data.description);
        }),
      axios
        .get(`https://lambda.roamjs.com/check?extensionId=static-site${dev}`, {
          headers: { Authorization: getAuthorizationHeader() },
        })
        .then((r) => {
          setEnabled(r.data.success);
          const subscribedUids = getShallowTreeByParentUid(pageUid)
            .filter((n) => toFlexRegex("subscribed").test(n.text))
            .map((n) => n.uid);
          if (!r.data.success) {
            subscribedUids.forEach(deleteBlock);
          } else if (r.data.success && !subscribedUids.length) {
            onNext();
          }
        }),
    ])
      .catch(catchError)
      .finally(() => setLoading(false));
    return () => clearTimeout(intervalListener.current);
  }, [catchError, dev, setEnabled, setPricingMessage, pageUid, onNext]);
  return (
    <>
      <div style={{ height: 120 }}>
        {!loading ? (
          <p style={{ whiteSpace: "pre-wrap" }}>
            {enabled
              ? `You have sucessfully subscribed!\n\nGo back to the previous screen to configure and deploy your website!`
              : `This is a premium extension and will require a paid subscription to enable.\n\n${productDescription}`}
          </p>
        ) : (
          <Spinner />
        )}
      </div>
      <Button
        onClick={() => setIsOpen(true)}
        intent={
          loading ? Intent.NONE : enabled ? Intent.DANGER : Intent.PRIMARY
        }
        disabled={loading}
        style={{ maxWidth: 240 }}
      >
        {loading ? "Loading..." : enabled ? "Unsubscribe" : "Subscribe"}
      </Button>
      <p style={{ color: "red" }}>{error}</p>
      <Alert
        isOpen={isOpen}
        onConfirm={() => {
          setLoading(true);
          setError("");
          if (enabled) {
            axios
              .post(
                `https://lambda.roamjs.com/unsubscribe`,
                {
                  extensionId: "static-site",
                  dev: !!dev,
                },
                { headers: { Authorization: getAuthorizationHeader() } }
              )
              .then(() => {
                Promise.all(
                  getShallowTreeByParentUid(pageUid)
                    .filter((n) => toFlexRegex("subscribed").test(n.text))
                    .map((n) => deleteBlock(n.uid))
                ).then(() => setEnabled(false));
              })
              .catch(catchError)
              .finally(() => {
                setLoading(false);
                setIsOpen(false);
              });
          } else {
            axios
              .post(
                `https://lambda.roamjs.com/subscribe`,
                {
                  extensionId: "static-site",
                  dev: !!dev,
                },
                { headers: { Authorization: getAuthorizationHeader() } }
              )
              .then((r) => {
                if (r.data.url) {
                  const width = 600;
                  const height = 525;
                  const left = window.screenX + (window.innerWidth - width) / 2;
                  const top =
                    window.screenY + (window.innerHeight - height) / 2;
                  window.open(
                    r.data.url,
                    `roamjs:roamjs:stripe`,
                    `left=${left},top=${top},width=${width},height=${height},status=1`
                  );
                  const authInterval = () => {
                    axios
                      .get(
                        `https://lambda.roamjs.com/check?extensionId=static-site${dev}`,
                        { headers: { Authorization: getAuthorizationHeader() } }
                      )
                      .then((r) => {
                        if (r.data.success) {
                          setEnabled(true);
                          setLoading(false);
                          setIsOpen(false);
                          onNext();
                        } else {
                          intervalListener.current = window.setTimeout(
                            authInterval,
                            2000
                          );
                        }
                      })
                      .catch((e) => {
                        catchError(e);
                        setLoading(false);
                        setIsOpen(false);
                      });
                  };
                  authInterval();
                } else if (r.data.success) {
                  setEnabled(true);
                  setLoading(false);
                  setIsOpen(false);
                  onNext();
                } else {
                  setError(
                    "Something went wrong with the subscription. Please contact support@roamjs.com for help!"
                  );
                  setLoading(false);
                  setIsOpen(false);
                }
              })
              .catch(catchError)
              .finally(() => {
                setLoading(false);
                setIsOpen(false);
              });
          }
        }}
        confirmButtonText={"Submit"}
        cancelButtonText={"Cancel"}
        intent={Intent.PRIMARY}
        loading={loading}
        onCancel={() => setIsOpen(false)}
      >
        {enabled
          ? `By clicking submit below, you will unsubscribe from the premium features of the RoamJS Extension: Static Site.`
          : `By clicking submit below, you will subscribe to the premium features of the RoamJS Extension: Static Site for ${pricingMessage}. A window may appear for checkout if this is your first premium extension`}
      </Alert>
    </>
  );
};

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
        labelElement={
          <>
            Use Custom Domain{" "}
            <Description
              description={
                "A custom domain is one you bought from a separate registrar. A non custom subdomain will be one under RoamJS. This could be changed at any time."
              }
            />
          </>
        }
        style={{ marginBottom: 32 }}
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
    if (!getPageUidByPageTitle(value)) {
      createPage({ title: value, tree: [{ text: "Welcome!" }] });
    }
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
  filterType,
  initialNodes = [{ text: "", uid: window.roamAlphaAPI.util.generateUID() }],
  saveNodes,
}: {
  filterType: string;
  initialNodes: InputTextNode[];
  saveNodes: (s: InputTextNode[]) => void;
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
  const [nodes, setNodes] = useState(initialNodes);
  const [tab, setTab] = useState<TabId>(nodes[0].uid);
  const [newTab, setNewTab] = useState("");
  return (
    <>
      <Tooltip content={"Edit Filter Layout"}>
        <Button icon={"layout-grid"} minimal onClick={openFilterLayout} />
      </Tooltip>
      <Dialog
        isOpen={filterLayoutOpen}
        title={`Layout for ${filterType} ${nodes[0]?.text}`}
        onClose={closeFilterLayout}
        isCloseButtonShown
        canOutsideClickClose
        canEscapeKeyClose
      >
        <div
          className={Classes.DIALOG_BODY}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Tabs selectedTabId={tab} onChange={(t) => setTab(t)}>
            {nodes.map((n, i) => {
              const preValue = n.children?.[0]?.text;
              const value =
                i === 0 && !HTML_REGEX.test(preValue)
                  ? `\`\`\`html\n${preValue}\`\`\``
                  : preValue;
              return (
                <Tab
                  id={n.uid}
                  key={n.uid}
                  title={i === 0 ? "Layout" : n.text}
                  panel={
                    CODE_BLOCK_REGEX.test(value) ? (
                      <CodeMirror
                        value={
                          (i === 0 ? HTML_REGEX : JS_REGEX).exec(value)?.[1] ||
                          ""
                        }
                        options={{
                          mode:
                            i === 0
                              ? { name: "xml", htmlMode: true }
                              : { name: "javascript" },
                          lineNumbers: true,
                          lineWrapping: true,
                        }}
                        onBeforeChange={(_, __, v) => {
                          const newNodes = [...nodes];
                          newNodes[i].children = [
                            {
                              text: `\`\`\`${
                                i === 0 ? "html" : "javascript"
                              }\n${v}\`\`\``,
                            },
                          ];
                          setNodes(newNodes);
                        }}
                      />
                    ) : (
                      <TextArea
                        value={value}
                        onChange={(e) => {
                          const newNodes = [...nodes];
                          newNodes[i].children = [{ text: e.target.value }];
                          setNodes(newNodes);
                        }}
                        style={{ width: "100%", height: 300 }}
                      />
                    )
                  }
                ></Tab>
              );
            })}
          </Tabs>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              {tab !== nodes[0].uid && (
                <>
                  <Checkbox
                    checked={CODE_BLOCK_REGEX.test(
                      nodes.find((n) => n.uid === tab)?.children?.[0]?.text
                    )}
                    style={{
                      marginBottom: 0,
                      lineHeight: "24px",
                      marginRight: 8,
                    }}
                    className={"roamjs-site-filter-toggle"}
                    label={"Dynamic"}
                    onChange={(e) => {
                      setNodes(
                        nodes.map((n, i) =>
                          n.uid === tab
                            ? {
                                ...n,
                                children: [
                                  {
                                    ...n.children[0],
                                    text: (e.target as HTMLInputElement).checked
                                      ? `\`\`\`javascript\n${n.children[0]?.text}\`\`\``
                                      : JS_REGEX.exec(n.children[0]?.text)?.[1],
                                  },
                                ],
                              }
                            : n
                        )
                      );
                    }}
                  />
                  <Button
                    minimal
                    icon={"trash"}
                    style={{
                      width: 24,
                      height: 24,
                      minWidth: 24,
                      minHeight: 24,
                    }}
                    onClick={() => {
                      setNodes(nodes.filter((n) => n.uid !== tab));
                      setTab(nodes[0].uid);
                    }}
                  />
                </>
              )}
            </div>
            <div style={{ display: "flex" }}>
              <InputGroup
                value={newTab}
                onChange={(e) => setNewTab(e.target.value)}
                placeholder={"New Layout Variable"}
              />
              <Tooltip content={"Add Layout Variable"}>
                <Button
                  minimal
                  disabled={!newTab}
                  icon={"plus"}
                  onClick={() => {
                    const uid = window.roamAlphaAPI.util.generateUID();
                    setNodes([
                      ...nodes,
                      {
                        text: newTab,
                        children: [{ text: "value" }],
                        uid,
                      },
                    ]);
                    setNewTab("");
                    setTab(uid);
                  }}
                />
              </Tooltip>
            </div>
          </div>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text={"Cancel"} onClick={closeFilterLayout} />
            <Button
              text={"Save"}
              intent={Intent.PRIMARY}
              onClick={() => {
                saveNodes(nodes);
                closeFilterLayout();
              }}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
};

const removeUidFromNodes = (nodes: InputTextNode[]): InputTextNode[] =>
  nodes.map(({ uid: _, ...node }) => ({
    ...node,
    children: removeUidFromNodes(node.children || []),
  }));
const RequestFiltersContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [filters, setFilters] = useState<InputTextNode[]>(
    () =>
      getBasicTreeByParentUid(
        getPageUidByPageTitle("roam/js/static-site")
      ).find((t) => /filter/i.test(t.text))?.children || []
  );
  const onSubmit = useCallback(() => {
    const tree = getBasicTreeByParentUid(pageUid);
    const keyNode = tree.find((t) => /filter/i.test(t.text));
    const cleanFilters = removeUidFromNodes(filters);
    if (keyNode) {
      keyNode.children.forEach(({ uid }) =>
        window.roamAlphaAPI.deleteBlock({ block: { uid } })
      );
      cleanFilters.forEach((node, order) =>
        createBlock({ node, order, parentUid: keyNode.uid })
      );
    } else if (!keyNode) {
      createBlock({
        node: { text: "Filter", children: cleanFilters },
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
            children: [{ text: "```html\n${PAGE_CONTENT}```" }],
          },
        ],
        uid: window.roamAlphaAPI.util.generateUID(),
      },
    ]);
  }, [filters, setFilters]);
  return (
    <>
      <div style={{ margin: "16px 0" }}>
        <Label>
          Filters
          <Description
            description={
              "Add the filter criteria for specifying which pages in your graph will be included in your website."
            }
          />
        </Label>
        {filters.map((f) => (
          <div
            key={f.uid}
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingRight: "25%",
              marginBottom: 16,
            }}
          >
            <div style={{ minWidth: 144 }}>
              <MenuItemSelect
                items={["STARTS WITH", "TAGGED WITH", "DAILY", "ALL"]}
                onItemSelect={(s) =>
                  setFilters(
                    filters.map((filter) =>
                      f.uid === filter.uid ? { ...filter, text: s } : filter
                    )
                  )
                }
                activeItem={f.text}
              />
            </div>
            <div style={{ minWidth: 220 }}>
              {f.text === "TAGGED WITH" ? (
                <PageInput
                  value={f.children[0]?.text}
                  setValue={(text) =>
                    setFilters(
                      filters.map((filter) =>
                        f.uid === filter.uid
                          ? {
                              ...filter,
                              children: [{ ...f.children[0], text }],
                            }
                          : filter
                      )
                    )
                  }
                />
              ) : f.text === "STARTS WITH" ? (
                <InputGroup
                  value={f.children[0]?.text}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFilters(
                      filters.map((filter) =>
                        f.uid === filter.uid
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
              ) : (
                <span />
              )}
            </div>
            <FilterLayout
              filterType={f.text}
              initialNodes={f.children}
              saveNodes={(v) =>
                setFilters(
                  filters.map((filter) =>
                    f.uid === filter.uid
                      ? {
                          ...filter,
                          children: v,
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
                setFilters(filters.filter((filter) => filter.uid !== f.uid))
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

const getLaunchBody = (pageUid: string) => {
  const tree = getBasicTreeByParentUid(pageUid);
  return {
    graph: getGraph(),
    domain: tree.find((t) => /domain/i.test(t.text))?.children?.[0]?.text,
  };
};

type Filter = {
  rule: string;
  value: string;
  layout: string;
  variables: Record<string, string>;
};
const TITLE_REGEX = new RegExp(`roam/js/static-site/title::(.*)`);
const METADATA_REGEX = /roam\/js\/static-site\/([a-z-]+)::(.*)/;
const HTML_REGEX = new RegExp("```html\n(.*)```", "s");
const JS_REGEX = new RegExp("```javascript\n(.*)```", "s");
const CODE_BLOCK_REGEX = new RegExp("```([a-z]+)\n(.*)```", "s");

const inlineTryCatch = (
  tryFcn: Function,
  catchFcn: (e: Error) => string
): string => {
  try {
    return tryFcn();
  } catch (e) {
    console.error(e);
    return catchFcn(e);
  }
};

const extractValue = (s: string, pageUid: string) => {
  const postTag = extractTag(s.trim());
  const postImage = IMAGE_REGEX.test(postTag)
    ? IMAGE_REGEX.exec(postTag)?.[1]
    : postTag;
  const postHtml = HTML_REGEX.test(postTag)
    ? HTML_REGEX.exec(postImage)?.[1]
    : postImage;
  const postJs = JS_REGEX.test(postHtml)
    ? inlineTryCatch(
        () =>
          new Function("uid", JS_REGEX.exec(postHtml)?.[1] || postHtml)(
            pageUid
          ),
        () => postHtml
      )
    : postHtml;
  return postJs;
};

type MinimalRoamNode = Omit<Partial<TreeNode>, "order" | "children"> & {
  children?: MinimalRoamNode[];
};

const formatRoamNodes = (nodes: Partial<TreeNode>[]): MinimalRoamNode[] =>
  nodes
    .sort(({ order: a }, { order: b }) => a - b)
    .filter((t) => !(t.text || "").includes(IGNORE_BLOCKS))
    .map(({ order, ...node }) => ({
      ...node,
      ...(node.children
        ? {
            children: formatRoamNodes(node.children),
          }
        : {}),
    }));

export const getDeployBody = (pageUid: string) => {
  const configPageTree = getBasicTreeByParentUid(pageUid);
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
  const filesNode = getConfigNode("files");
  const getCode = (node?: RoamBasicNode) =>
    (node?.children || [])
      .map((s) => s.text.match(HTML_REGEX))
      .find((s) => !!s)?.[1];
  const template = getCode(templateNode);
  const referenceTemplate = getCode(referenceTemplateNode);
  const withIndex = indexNode?.children?.length
    ? { index: extractTag(indexNode.children[0].text.trim()) }
    : {};
  if (!withIndex?.index) {
    throw new Error("The Website Index is not set and is required.");
  }
  if (!getPageUidByPageTitle(withIndex.index)) {
    throw new Error(`Could not find your index page: ${withIndex.index}`);
  }
  const withFilter = filterNode?.children?.length
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
          themeNode.children.map((p) => [p.text, p.children[0]?.text])
        ),
      }
    : {};
  const withFiles = filesNode?.children?.length
    ? {
        files: Object.fromEntries(
          filesNode.children.map(({ text, children = [] }) => [
            text,
            UPLOAD_REGEX.exec(
              getTextByBlockUid(extractRef(children[0]?.text || ""))
            )?.[1] || "",
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
    ...withFiles,
  };
  const hasDaily = config.filter.some((s) => s.rule === "DAILY");
  const createFilterQuery = (freeVar: string) => `(or-join [${freeVar} ?f${
    hasDaily ? " ?regex" : ""
  }]
    ${config.filter
      .map((f, i) => {
        const createFilterRule = (s: string) => `(and ${s} [(+ 0 ${i}) ?f])`;
        switch (f.rule) {
          case "STARTS WITH":
            return createFilterRule(
              `[${freeVar} :node/title ?title] [(clojure.string/starts-with? ?title "${f.value}")]`
            );
          case "TAGGED WITH":
            return createFilterRule(
              `[?c :block/page ${freeVar}] [?c :block/refs ?r] [?r :node/title "${f.value}"]`
            );
          case "DAILY":
            return createFilterRule(
              `[${freeVar} :node/title ?title] [(re-matches ?regex ?title)]`
            );
          default:
            return createFilterRule(`[${freeVar} :node/title]`);
        }
      })
      .concat(`(and [${freeVar} :node/title "${config.index}"] [(+ 0 -1) ?f])`)
      .join(" ")}
  )`;
  const entries = window.roamAlphaAPI
    .q(
      `[:find (pull ?b [
      [:block/string :as "text"] 
      :node/title 
      :block/uid 
      :block/order 
      :block/heading
      [:children/view-type :as "viewType"] 
      [:block/text-align :as "textAlign"]
      {:block/children ...}
    ]) ?f
    ${hasDaily ? ":in $ ?regex" : ""}
    :where [?b :block/uid] ${createFilterQuery("?b")}]`,
      ...(hasDaily ? [DAILY_NOTE_PAGE_TITLE_REGEX] : [])
    )
    .map((p) => {
      const [
        { title: pageName, uid, children = [], viewType = "bullet" },
        layout,
      ] = p as [Omit<Partial<TreeNode>, "text"> & { title?: string }, number];
      return {
        pageName,
        content: children,
        viewType,
        uid,
        layout,
      };
    });

  // either the source or the destination needs to match the title filter
  const references = window.roamAlphaAPI
    .q(
      `[:find 
        (pull ?refpage [:node/title]) 
        (pull ?ref [
          [:block/string :as "text"]
          :node/title 
          :block/uid 
          :block/order 
          :block/heading
          [:children/view-type :as "viewType"] 
          [:block/text-align :as "textAlign"]
          {:block/children ...}
        ]) 
        (pull ?node [:node/title :block/string :block/uid]) 
        ${hasDaily ? ":in $ ?regex" : ""}
        :where 
        [?ref :block/refs ?node] [?ref :block/page ?refpage] (or-join [?node ?refpage${
          hasDaily ? " ?regex" : ""
        }] ${createFilterQuery("?node")} ${createFilterQuery("?refpage")})]`,
      ...(hasDaily ? [DAILY_NOTE_PAGE_TITLE_REGEX] : [])
    )
    .map(
      ([{ title }, node, { title: refTitle, string: refText, uid: refUid }]: [
        Record<string, string>,
        Omit<Partial<TreeNode>, "text"> & { title?: string; text?: string },
        Record<string, string>
      ]) => ({
        title,
        node: formatRoamNodes([
          { ...node, text: node.title || node.text || "" },
        ])[0],
        refText,
        refTitle,
        refUid,
      })
    );

  const pages = Object.fromEntries(
    entries.map(({ content, pageName, layout, uid, ...props }) => {
      const allBlocks = content.flatMap(allBlockMapper);
      const titleMatch = allBlocks
        .find((s) => TITLE_REGEX.test(s.text))
        ?.text?.match?.(TITLE_REGEX);
      const title = titleMatch ? titleMatch[1].trim() : pageName;
      const metadata = {
        ...Object.fromEntries(
          allBlocks
            .filter((s) => METADATA_REGEX.test(s.text))
            .map((node) => ({
              match: node.text.match(METADATA_REGEX),
              node,
            }))
            .filter(({ match }) => !!match && match.length >= 3)
            .map(({ match, node }) => ({
              key: match[1],
              value: match[2].trim() || node.children?.[0]?.text || "",
            }))
            .map(({ key, value }) => [key, extractValue(value, uid)])
            .concat([["name", title.split("/").slice(-1)[0]]])
        ),
        ...Object.fromEntries(
          Object.entries(config.filter[layout]?.variables || {}).map(
            ([k, v]) => [k, extractValue(v, uid)]
          )
        ),
      };
      return [
        pageName,
        {
          content: formatRoamNodes(content),
          metadata,
          layout,
          uid,
          ...props,
        },
      ];
    })
  );
  return {
    data: JSON.stringify({
      pages,
      config,
      references,
    }),
  };
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
        intent={intent}
      >
        {children}
      </Alert>
    </>
  );
};

const LiveContent: StageContent = () => {
  const pageUid = usePageUid();
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
      apiGet(`website-status?graph=${getGraph()}`).then((r) => {
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
            apiGet(`website-variables?graph=${getGraph()}`)
              .then((r) => {
                const diffs = [];
                const tree = getBasicTreeByParentUid(pageUid);
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
      pageUid,
    ]
  );
  const wrapPost = useCallback(
    (path: string, getData: (uid: string) => Record<string, unknown>) => {
      setError("");
      setLoading(true);
      return new Promise<Record<string, unknown>>((resolve, reject) =>
        setTimeout(() => {
          try {
            const data = getData(pageUid);
            resolve(data);
          } catch (e) {
            console.error(e);
            reject(e);
          }
        }, 1)
      )
        .then((data) => apiPost(path, data))
        .then(getWebsite)
        .then(() => true)
        .catch((e) => {
          setError(
            e.response?.data?.errorMessage || e.response?.data || e.message
          );
          return false;
        })
        .finally(() => setLoading(false));
    },
    [setError, setLoading, getWebsite, pageUid]
  );
  const manualDeploy = useCallback(
    () => wrapPost('deploy-website', getDeployBody),
    [wrapPost]
  );
  const launchWebsite = useCallback(
    () =>
      wrapPost("launch-website", getLaunchBody).then(
        (success) =>
          success &&
          apiPost('deploy-website', getDeployBody(pageUid))
      ),
    [wrapPost, pageUid]
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
  const domain = useMemo(
    () =>
      getBasicTreeByParentUid(pageUid).find((t) =>
        toFlexRegex("domain").test(t.text)
      )?.children?.[0]?.text,
    [pageUid]
  );
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
                        href={`https://${domain}`}
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
                  Deploy
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

type PluginTab = { id: string; options?: string[]; multi?: true };

type Plugin = {
  id: string;
  tabs: PluginTab[];
  description: string;
};

const pluginIds: Plugin[] = [
  {
    id: "footer",
    description:
      "Add a standardized footer to the bottom of every page on your website",
    tabs: [{ id: "links", multi: true }, { id: "copyright" }],
  },
  {
    id: "header",
    description:
      "Add a standardized header to the top of every page on your website",
    tabs: [
      { id: "links", options: ["{page}"], multi: true },
      { id: "home" },
      { id: "right icon" },
    ],
  },
  {
    id: "image-preview",
    description:
      "Turns all images that were in Roam blocks preview-able in the same way as they were in Roam",
    tabs: [],
  },
  // { id: "inline-block-references", tabs: [] },
  {
    id: "paths",
    description:
      "Provides different options for specifying the names of all of your URL paths",
    tabs: [{ id: "type", options: ["uid", "lowercase"] }],
  },
  {
    id: "sidebar",
    description:
      "Add a static sidebar to the right of the page that host different widgets of information",
    tabs: [
      {
        id: "widgets",
        options: ["graph"],
        multi: true,
      },
    ],
  },
];

const RequestPluginsContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const pluginUid = useMemo(() => {
    const pluginUid = getShallowTreeByParentUid(pageUid).find((t) =>
      toFlexRegex("plugins").test(t.text)
    )?.uid;
    if (pluginUid) return pluginUid;
    const newPluginUid = window.roamAlphaAPI.util.generateUID();
    createBlock({
      parentUid: pageUid,
      node: { text: "plugins", uid: newPluginUid },
      order: 1,
    });
    return newPluginUid;
  }, [pageUid]);
  const [values, setValues] = useState<
    Record<string, Record<string, string[]>>
  >(() =>
    Object.fromEntries(
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
  );
  const outerKeys = useMemo(() => pluginIds.map(({ id }) => id), []);
  const [outerKey, setOuterKey] = useState(outerKeys[0]);
  const outerTabSelected = useMemo(
    () => pluginIds.find(({ id }) => id === outerKey),
    [outerKey]
  );
  const outerTabById = useMemo(
    () =>
      Object.fromEntries(
        outerTabSelected.tabs.map(({ id, ...rest }) => [id, rest])
      ),
    [outerTabSelected]
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
            "Enable any of the following plugins to include extra features on your website!"
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
                  setActiveValue(
                    outerTabById[k].multi ? "" : values[tabId][k]?.[0] || ""
                  );
                }}
                selectedTabId={innerKey}
              >
                <Tab
                  id={tabId}
                  key={tabId}
                  title={"enabled"}
                  panel={
                    <>
                      <Switch
                        label={"Enabled"}
                        checked={!!values[tabId]}
                        onChange={(e) => {
                          const checked = (e.target as HTMLInputElement)
                            .checked;
                          if (checked) {
                            setValues({ ...values, [tabId]: {} });
                          } else {
                            const { [tabId]: _, ...rest } = values;
                            setValues(rest);
                          }
                        }}
                      />
                      <br />
                      <span style={{ fontSize: 12, marginTop: 16 }}>
                        {outerTabSelected.description}
                      </span>
                    </>
                  }
                />
                {outerTabSelected.tabs.map(
                  ({ id: subtabId, options = [], multi }) => {
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
                                  onChange={(e) => {
                                    setActiveValue(e.target.value);
                                    if (!multi) {
                                      setValues({
                                        ...values,
                                        [tabId]: {
                                          ...values[tabId],
                                          [subtabId]: [e.target.value],
                                        },
                                      });
                                    }
                                  }}
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

const SecretFeature: React.FC = ({ children }) => {
  const timeoutRef = useRef(0);
  const [visibility, setVisibility] = useState<"hidden" | "visible">("hidden");
  return (
    <div
      onMouseEnter={() =>
        (timeoutRef.current = window.setTimeout(
          () => setVisibility("visible"),
          5000
        ))
      }
      onMouseLeave={() => clearTimeout(timeoutRef.current)}
    >
      <div style={{ visibility }}>{children}</div>
    </div>
  );
};

const ThemeBrowser = ({
  importTheme,
}: {
  importTheme: (s: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [themes, setThemes] = useState<
    { name: string; description: string; thumbnail: string; value: string }[]
  >([]);
  const [selectedTheme, setSelectedTheme] = useState<number>();
  const [loading, setLoading] = useState(false);
  const openBrowser = useCallback(() => {
    setIsOpen(true);
    setLoading(true);
    apiGet(`themes`)
      .then((r) => setThemes(r.data.themes))
      .finally(() => setLoading(false));
  }, [setIsOpen, setLoading, setThemes]);
  const closeBrowser = useCallback(() => setIsOpen(false), [setIsOpen]);
  return (
    <div style={{ margin: "16px 0" }}>
      <Button text={"Browse"} onClick={openBrowser} />
      <Dialog
        isOpen={isOpen}
        title={`Browse Default Themes!`}
        onClose={closeBrowser}
        isCloseButtonShown
        canOutsideClickClose
        canEscapeKeyClose
        style={{
          width: 1000,
          height: 600,
        }}
      >
        <div
          className={Classes.DIALOG_BODY}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {loading && <Spinner />}
          <RadioGroup
            selectedValue={selectedTheme}
            onChange={(e) =>
              setSelectedTheme(Number((e.target as HTMLInputElement).value))
            }
          >
            {themes.map((theme, i) => (
              <Radio
                value={i}
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column-reverse",
                  alignItems: "center",
                  maxWidth: 200,
                }}
                labelElement={
                  <div>
                    <h4>{theme.name}</h4>
                    <img src={theme.thumbnail}></img>
                    <p>{theme.description}</p>
                  </div>
                }
              />
            ))}
          </RadioGroup>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text={"Cancel"} onClick={closeBrowser} />
            <Button
              text={"Import"}
              intent={Intent.PRIMARY}
              disabled={typeof selectedTheme !== "number"}
              onClick={() => {
                importTheme(themes[selectedTheme].value);
                closeBrowser();
              }}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};

const RequestThemeContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const { uid: themeUid, children: themeChildren } = useSubTree({
    parentUid: pageUid,
    key: "theme",
    order: 1,
  });
  const [value, setValue] = useState(() =>
    getSettingValueFromTree({ tree: themeChildren, key: "css" })
  );
  const codeValue = useMemo(() => CSS_REGEX.exec(value)?.[1] || "", [value]);

  const onSubmit = useCallback(() => {
    setInputSetting({ blockUid: themeUid, key: "css", value });
    nextStage();
  }, [value, nextStage, themeUid]);
  return (
    <div>
      <Label>
        Theme
        <Description
          description={"Configure the look and feel of your website!"}
        />
      </Label>
      <div
        className={"roamjs-codemirror-wrapper"}
        style={{
          border: "1px solid lightgray",
          position: "relative",
          marginBottom: 16,
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CodeMirror
          value={codeValue}
          options={{
            mode: { name: "css" },
            lineNumbers: true,
            lineWrapping: true,
          }}
          onBeforeChange={(_, __, v) => setValue(`\`\`\`css\n${v}\`\`\``)}
        />
      </div>
      <SecretFeature>
        <ThemeBrowser
          importTheme={(s) =>
            setValue(
              `\`\`\`css\n${
                codeValue.trim() ? `${codeValue.trim()}\n` : ""
              }/* Start Imported Theme */\n${s}\n/* End Imported Theme */\`\`\``
            )
          }
        />
      </SecretFeature>
      <ServiceNextButton onClick={onSubmit} />
    </div>
  );
};

const RequestFilesContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const { uid: fileUid, children: fileChildren } = useSubTree({
    parentUid: pageUid,
    key: "files",
    order: 1,
  });
  const [values, setValues] = useState<
    Record<string, { path: string; url: string; uid: string }>
  >(() =>
    fileUid
      ? Object.fromEntries(
          fileChildren.map(({ uid, text, children = [] }) => [
            uid,
            {
              path: text,
              ...(UPLOAD_REGEX.test(children[0]?.text)
                ? {
                    uid: children[0]?.uid,
                    url: children[0]?.text,
                  }
                : {
                    uid: extractRef(children[0]?.text || ""),
                    url: getTextByBlockUid(extractRef(children[0]?.text || "")),
                  }),
            },
          ])
        )
      : {}
  );
  const onSubmit = useCallback(() => {
    fileChildren.forEach(({ uid }) => deleteBlock(uid));
    Object.entries(values)
      .map(([, { path, uid }]) => ({
        text: path,
        children: [
          {
            text: `((${uid}))`,
          },
        ],
      }))
      .forEach((node, order) =>
        createBlock({ parentUid: fileUid, node, order })
      );
    nextStage();
  }, [values, nextStage, fileUid, fileChildren]);
  const getAllBlocks = useCallback(
    () =>
      window.roamAlphaAPI
        .q(
          `[:find ?u ?contents :where [?p :block/uid ?u] [?p :block/string ?contents] [(clojure.string/includes? ?contents "https")]]`
        )
        .map(([uid, text]: string[]) => ({ uid, text })),
    []
  );
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        {Object.entries(values).map(([uid, { path, url }]) => (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
            key={uid}
          >
            <Label>
              Path
              <InputGroup
                value={path}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [uid]: { ...values[uid], path: e.target.value },
                  })
                }
              />
            </Label>
            <Label style={{ margin: "0 8px 15px", flexGrow: 1 }}>
              URL
              <BlockInput
                value={url}
                setValue={(val, urlUid) =>
                  setValues({
                    ...values,
                    [uid]: { url: val, path, uid: urlUid },
                  })
                }
                getAllBlocks={getAllBlocks}
              />
            </Label>
            <Button
              icon={"trash"}
              minimal
              onClick={() =>
                setValues({
                  ...Object.fromEntries(
                    Object.entries(values).filter(([u]) => u !== uid)
                  ),
                })
              }
            />
          </div>
        ))}
        <Button
          text={"Add File"}
          intent={Intent.SUCCESS}
          onClick={() =>
            setValues({
              ...values,
              [window.roamAlphaAPI.util.generateUID()]: {
                path: "",
                url: "",
                uid: "",
              },
            })
          }
        />
      </div>
      <ServiceNextButton onClick={onSubmit} />
    </div>
  );
};

const StaticSiteDashboard = (): React.ReactElement => {
  useRoamJSTokenWarning();
  return (
    <ServiceDashboard
      service={"static-site"}
      stages={[
        {
          component: RequestSubscriptionContent,
          setting: "Subscribed",
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
        { component: RequestFilesContent, setting: "Files" },
      ]}
    />
  );
};

export default StaticSiteDashboard;
