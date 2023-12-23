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
import { Controlled as CodeMirror } from "@dvargas92495/react-codemirror2";
import "@dvargas92495/codemirror/mode/xml/xml";
import "@dvargas92495/codemirror/mode/css/css";
import "@dvargas92495/codemirror/mode/javascript/javascript";
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
} from "./ServiceComponents";
import apiGet from "roamjs-components/util/apiGet";
import apiPost from "roamjs-components/util/apiPost";
import apiDelete from "roamjs-components/util/apiDelete";
import apiPut from "roamjs-components/util/apiPut";
import AutocompleteInput from "roamjs-components/components/AutocompleteInput";
import { v4 } from "uuid";
import { getNodeEnv } from "roamjs-components/util/env";
import { z } from "zod";

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="description" content="$\{PAGE_DESCRIPTION}"/>
<meta property="og:description" content="$\{PAGE_DESCRIPTION}">
<title>$\{PAGE_NAME}</title>
<meta property="og:title" content="$\{PAGE_NAME}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary" />
<meta name="twitter:creator" content="$\{PAGE_USER}" />
<meta name="twitter:title" content="$\{PAGE_NAME}" />
<meta name="twitter:description" content="$\{PAGE_DESCRIPTION}" />
<meta name="og:image" content="$\{PAGE_THUMBNAIL}" />
<meta name="twitter:image" content="$\{PAGE_THUMBNAIL}" />
$\{PAGE_HEAD}
</head>
<body>
<div id="content">
$\{PAGE_CONTENT}
</div>
<div id="references">
<ul>
$\{PAGE_REFERENCES}
</ul>
</div>
</body>
</html>`;
const hostedDomain = ".publishing.samepage.network";

const samePageApiWrapper =
  <T extends ArrayBuffer | Record<string, unknown>>(
    fcn: (body: Record<string, unknown>) => Promise<T>
  ) =>
  (path: string, data?: Record<string, unknown>) =>
    fcn({
      path,
      data,
      domain: `${
        getNodeEnv() === "development"
          ? "http://localhost:3003"
          : "https://api.samepage.network"
      }/publishing`,
    });

function samePageApiPost<T extends ArrayBuffer | Record<string, unknown>>(
  path: string,
  data?: Record<string, unknown>
) {
  return samePageApiWrapper<T>(apiPost)(path, data);
}
function samePageApiPut<T extends ArrayBuffer | Record<string, unknown>>(
  path: string,
  data?: Record<string, unknown>
) {
  return samePageApiWrapper<T>(apiPut)(path, data);
}
function samePageApiGet<T extends ArrayBuffer | Record<string, unknown>>(
  path: string,
  data?: Record<string, unknown>
) {
  return samePageApiWrapper<T>(apiGet)(path, data);
}
function samePageApiDelete<T extends ArrayBuffer | Record<string, unknown>>(
  path: string,
  data?: Record<string, unknown>
) {
  return samePageApiWrapper<T>(apiDelete)(path, data);
}

const defer =
  <R extends unknown, P extends unknown[]>(fcn: (...args: P) => R) =>
  async (...args: P) =>
    new Promise<R>((r) =>
      setTimeout(() => {
        const ret = fcn(...args);
        r(ret);
      }, 1)
    );

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

const ErrorIndicator = ({ error }: { error: string }) => {
  return error ? (
    <div
      style={{
        color: "darkred",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={error}
    >
      {error}
    </div>
  ) : null;
};

const DNS_TYPES = [
  "A",
  "AAAA",
  "CAA",
  "CNAME",
  "DS",
  "MX",
  "NAPTR",
  "NS",
  "PTR",
  "SOA",
  "SPF",
  "SRV",
  "TXT",
] as const;
type DNSRecordType = (typeof DNS_TYPES)[number];
type DNSRecord = { name: string; type: DNSRecordType; value: string };

const DNSRecordView = ({
  record,
  onDelete,
  onError,
  onUpdate,
}: {
  record: DNSRecord;
  onDelete: () => void;
  onError: (s: string) => void;
  onUpdate: (r: DNSRecord) => void;
}) => {
  const [isEdit, setIsEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newRecordValue, setNewRecordValue] = useState(record.value);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 200,
          minWidth: 200,
          textOverflow: "ellipsis",
          overflow: "hidden",
          marginRight: 8,
          whiteSpace: "nowrap",
        }}
      >
        {record.name}
      </span>
      <span
        style={{
          display: "inline-block",
          width: 96,
          minWidth: 96,
          marginRight: 8,
        }}
      >
        {record.type}
      </span>
      <span
        style={{
          display: "inline-block",
          marginRight: 8,
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
          flexGrow: 1,
        }}
      >
        {isEdit ? (
          <InputGroup
            placeholder={"Enter value..."}
            value={newRecordValue}
            onChange={(e) => setNewRecordValue(e.target.value)}
          />
        ) : (
          record.value
        )}
      </span>
      <span
        style={{
          width: 96,
          minWidth: 96,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <span
          style={{
            width: 16,
            minWidth: 16,
            marginRight: 16,
            display: "inline-block",
          }}
        >
          {loading && <Spinner size={16} />}
        </span>
        {isEdit ? (
          <Button
            icon={"saved"}
            style={{ width: 32, height: 32 }}
            minimal
            disabled={loading}
            onClick={() => {
              const newBody = {
                name: record.name,
                type: record.type,
                value: newRecordValue,
              };
              setLoading(true);
              samePageApiPut(`website-records`, newBody)
                .then(() => {
                  onUpdate(newBody);
                  setIsEdit(false);
                })
                .catch((e) =>
                  onError(e.response?.data?.errorMessage || e.response?.data)
                )
                .finally(() => setLoading(false));
            }}
          />
        ) : (
          <Button
            icon={"edit"}
            style={{ width: 32, height: 32 }}
            minimal
            onClick={() => setIsEdit(true)}
            disabled={record.value.includes("acm-validations.aws") || loading}
          />
        )}
        {isEdit ? (
          <Button
            icon={"cross"}
            style={{ width: 32, height: 32 }}
            minimal
            onClick={() => setIsEdit(false)}
            disabled={loading}
          />
        ) : (
          <Button
            icon={"trash"}
            style={{ width: 32, height: 32 }}
            minimal
            onClick={() => {
              setLoading(true);
              samePageApiGet(
                `website-records?name=${record.name}&type=${record.type}&value=${record.value}`
              )
                .then(onDelete)
                .catch((e) =>
                  onError(e.response?.data?.errorMessage || e.response?.data)
                )
                .finally(() => setLoading(false));
            }}
            disabled={record.value.includes("acm-validations.aws") || loading}
          />
        )}
      </span>
    </div>
  );
};

const RequestDomainContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const pageUid = useServicePageUid();
  const [value, setValue] = useState(useServiceField("domain"));
  const [error, setError] = useState("");
  const [domainSwitch, setDomainSwitch] = useState(
    !value.endsWith(hostedDomain)
  );
  const onSwitchChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const { checked } = e.target as HTMLInputElement;
      setDomainSwitch(checked);
      setValue(
        checked ? value.replace(hostedDomain, "") : `${value}${hostedDomain}`
      );
    },
    [setDomainSwitch, value]
  );
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setValue(
        `${e.target.value.toLowerCase()}${domainSwitch ? "" : hostedDomain}`
      ),
    [setValue, domainSwitch]
  );
  const onBlur = useCallback(() => {
    if (domainSwitch && !DOMAIN_REGEX.test(value)) {
      return setError("Invalid domain. Try a .com!");
    } else if (
      !domainSwitch &&
      !SUBDOMAIN_REGEX.test(value.replace(hostedDomain, ""))
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
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [newRecordName, setNewRecordName] = useState<string>("");
  const [newRecordType, setNewRecordType] = useState<DNSRecordType>(
    DNS_TYPES[0]
  );
  const [loading, setLoading] = useState(false);
  const [newRecordValue, setNewRecordValue] = useState("");
  useEffect(() => {
    samePageApiGet<{ records: DNSRecord[] }>("website-records").then((r) =>
      setRecords(r.records)
    );
  }, []);
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
        {domainSwitch ? "Custom Domain" : "SamePage Subdomain"}
        <InputGroup
          value={domainSwitch ? value : value.replace(hostedDomain, "")}
          onChange={onChange}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          rightElement={
            !domainSwitch ? (
              <span
                style={{ opacity: 0.5, margin: 4, display: "inline-block" }}
              >
                {hostedDomain}
              </span>
            ) : undefined
          }
        />
      </Label>
      <ErrorIndicator error={error} />
      {!!records.length && (
        <>
          <h4 style={{ marginTop: 8 }}>DNS Records</h4>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Label
              style={{
                display: "inline-block",
                width: 200,
                minWidth: 200,
                textOverflow: "ellipsis",
                overflow: "hidden",
                marginRight: 8,
              }}
            >
              Name
            </Label>
            <Label
              style={{
                display: "inline-block",
                width: 96,
                minWidth: 96,
                marginRight: 8,
              }}
            >
              Type
            </Label>
            <Label
              style={{
                display: "inline-block",
                flexGrow: 1,
                marginRight: 8,
              }}
            >
              Value
            </Label>
            <Label style={{ width: 96, minWidth: 96, display: "inline-block" }}>
              Action
            </Label>
          </div>
          {records.map((record) => (
            <DNSRecordView
              record={record}
              key={`${record.name}:${record.type}:${record.value}`}
              onDelete={() => {
                setRecords(records.filter((r) => r !== record));
              }}
              onError={setError}
              onUpdate={(newRecord) => {
                setRecords(records.map((r) => (r === record ? newRecord : r)));
              }}
            />
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Label
              style={{
                display: "inline-block",
                width: 200,
                minWidth: 200,
                textOverflow: "ellipsis",
                overflow: "hidden",
                marginRight: 8,
              }}
            >
              Name
              <InputGroup
                placeholder={"Enter subdomain"}
                value={newRecordName}
                onChange={(e) => setNewRecordName(e.target.value)}
              />
            </Label>
            <Label
              style={{
                display: "inline-block",
                width: 96,
                minWidth: 96,
                marginRight: 8,
              }}
            >
              Type
              <MenuItemSelect
                activeItem={newRecordType}
                items={DNS_TYPES.slice(0)}
                onItemSelect={(e) => {
                  setNewRecordType(e);
                }}
              />
            </Label>
            <Label
              style={{
                display: "inline-block",
                flexGrow: 1,
                marginRight: 8,
              }}
            >
              Value
              <InputGroup
                placeholder={"Enter value..."}
                value={newRecordValue}
                onChange={(e) => setNewRecordValue(e.target.value)}
              />
            </Label>
            <Button
              style={{ width: 96, minWidth: 96, display: "inline-block" }}
              rightIcon={"plus"}
              text={"Add"}
              disabled={loading}
              onClick={() => {
                const body = {
                  name: newRecordName,
                  type: newRecordType,
                  value: newRecordValue,
                };
                setLoading(true);
                samePageApiPost<{ success: boolean }>(`website-records`, body)
                  .then((r) => {
                    if (r.success) {
                      setRecords(records.concat(body));
                      setNewRecordName("");
                      setNewRecordValue("");
                    } else {
                      throw new Error(
                        `Could not find hosted zone. Email support@samepage.network for assistance.`
                      );
                    }
                  })
                  .catch((e) =>
                    setError(
                      e.response?.data?.errorMessage ||
                        e.response?.data ||
                        e.message
                    )
                  )
                  .finally(() => setLoading(false));
              }}
            />
          </div>
        </>
      )}
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
  const [tab, setTab] = useState<TabId>(nodes[0].uid || "");
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
              const preValue = n.children?.[0]?.text || "";
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
                      nodes.find((n) => n.uid === tab)?.children?.[0]?.text ||
                        ""
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
                                    ...n.children?.[0],
                                    text: (e.target as HTMLInputElement).checked
                                      ? `\`\`\`javascript\n${n.children?.[0]?.text}\`\`\``
                                      : JS_REGEX.exec(
                                          n.children?.[0]?.text || ""
                                        )?.[1] || "",
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
                      setTab(nodes[0].uid || "");
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
                  value={f.children?.[0]?.text}
                  setValue={(text) =>
                    setFilters(
                      filters.map((filter) =>
                        f.uid === filter.uid
                          ? {
                              ...filter,
                              children: [{ ...f.children?.[0], text }],
                            }
                          : filter
                      )
                    )
                  }
                />
              ) : f.text === "STARTS WITH" ? (
                <InputGroup
                  value={f.children?.[0]?.text}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFilters(
                      filters.map((filter) =>
                        f.uid === filter.uid
                          ? {
                              ...filter,
                              children: [
                                {
                                  ...filter.children?.[0],
                                  text: e.target.value,
                                },
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
              initialNodes={f.children || []}
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

const getLaunchBody = (pageUid: string) => {
  const tree = getBasicTreeByParentUid(pageUid);
  return {
    graph: window.roamAlphaAPI.graph.name,
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
const METADATA_REGEX = /roam\/js\/static-site\/([a-zA-Z0-9-]+)::(.*)/;
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
    return catchFcn(e as Error);
  }
};

const extractValue = (s: string, pageUid: string) => {
  const postTag = extractTag(s.trim());
  const postImage = IMAGE_REGEX.test(postTag)
    ? IMAGE_REGEX.exec(postTag)?.[1] || ""
    : postTag;
  const postHtml = HTML_REGEX.test(postTag)
    ? HTML_REGEX.exec(postImage)?.[1] || ""
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
    .sort(({ order: a = 0 }, { order: b = 0 }) => a - b)
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
    : { index: "Website Index" };
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
    filter: [] as Filter[],
    ...withIndex,
    ...withFilter,
    ...withTemplate,
    ...withReferenceTemplate,
    ...withPlugins,
    ...withTheme,
    ...withFiles,
    version: 1,
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
        { title: pageName, uid = "", children = [], viewType = "bullet" },
        layout,
      ] = p as [Omit<Partial<TreeNode>, "text"> & { title?: string }, number];
      return {
        pageName,
        content: children,
        viewType,
        uid,
        layout,
      };
    })
    .filter((p) => !!p.pageName);

  // either the source or the destination needs to match the title filter
  const references = (
    window.roamAlphaAPI.q(
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
    ) as [
      Record<string, string>,
      Omit<Partial<TreeNode>, "text"> & { title?: string; text?: string },
      Record<string, string>
    ][]
  ).map(([refPage, ref, node]) => ({
    title: refPage?.title,
    node: formatRoamNodes([{ ...ref, text: ref?.title || ref?.text || "" }])[0],
    refText: node?.string,
    refTitle: node?.title,
    refUid: node?.uid,
  }));

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
              key: match?.[1],
              value: match?.[2].trim() || node.children?.[0]?.text || "",
            }))
            .map(({ key, value }) => [key, extractValue(value, uid)])
            .concat([["name", (title || "Unknown").split("/").slice(-1)[0]]])
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
    graph: window.roamAlphaAPI.graph.name,
  };
};

type CfVariableDiff = {
  field: string;
  old: string;
  value: string;
  key: string;
};

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
    loading: boolean;
  }
> = ({
  children,
  onConfirm,
  disabled = false,
  buttonText,
  intent,
  loading,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), [setIsOpen]);
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  return (
    <>
      <Button
        style={{ marginRight: 32, minWidth: 92 }}
        disabled={disabled}
        onClick={open}
        intent={intent}
        loading={loading}
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

type WebsiteStatus = {
  status: string;
  date: string;
  uuid: string;
  props: Record<string, unknown>;
};
type WebsiteProgressType =
  | "LAUNCHING"
  | "SHUTTING DOWN"
  | "DEPLOYING"
  | "UPDATING"
  | "";

const zWebsiteStautusProps = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("FAILURE"),
    props: z.object({ message: z.string() }),
  }),
  z.object({
    status: z.literal("AWAITING VALIDATION"),
    props: z
      .object({
        nameServers: z.array(z.string()),
      })
      .or(
        z.object({
          cname: z.object({
            name: z.string(),
            value: z.string(),
          }),
        })
      ),
  }),
  z.object({
    status: z.literal("PROGRESS"),
    props: z.object({
      value: z.number(),
      progressType: z.string(),
    }),
  }),
  z.object({
    status: z.literal("NONE"),
    props: z.undefined(),
  }),
]);

const WebsiteStatusesView = ({
  websiteStatuses,
  title,
}: {
  websiteStatuses: WebsiteStatus[];
  title: string;
}) => {
  const progressPanelProps = useMemo<
    z.infer<typeof zWebsiteStautusProps>
  >(() => {
    if (websiteStatuses.length === 0) {
      return {
        status: "NONE",
      };
    }
    const latest = websiteStatuses[0];
    const parsedProps = zWebsiteStautusProps.safeParse(latest);
    if (parsedProps.success) {
      return parsedProps.data;
    }
    if (["SUCCESS", "FAILURE"].includes(latest.status)) {
      return {
        status: "NONE",
      };
    }
    return {
      status: "PROGRESS",
      props: {
        value: 0.5,
        progressType: "DEPLOYING",
      },
    };
  }, [websiteStatuses]);
  return (
    <div style={{ flex: 1 }}>
      <h6>{title}</h6>
      <div style={{ height: 40 }}>
        {progressPanelProps.status === "FAILURE" ? (
          <ErrorIndicator error={progressPanelProps.props.message} />
        ) : progressPanelProps.status === "AWAITING VALIDATION" ? (
          <div style={{ color: "darkblue" }}>
            {"nameServers" in progressPanelProps.props && (
              <>
                To continue, add the following Name Servers to your Domain
                Management Settings:
                <ul>
                  {progressPanelProps.props.nameServers.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            )}
            {"cname" in progressPanelProps.props && (
              <>
                To continue, add the following CNAME to your Domain Management
                Settings:
                <p>
                  <b>Name: </b>
                  {progressPanelProps.props.cname.name}
                </p>
                <p>
                  <b>Value: </b>
                  {progressPanelProps.props.cname.value}
                </p>
              </>
            )}
          </div>
        ) : progressPanelProps.status === "PROGRESS" ? (
          <ProgressBar
            value={progressPanelProps.props.value}
            intent={progressTypeToIntent(progressPanelProps.props.progressType)}
          />
        ) : (
          <div />
        )}
      </div>
      <ul style={{ paddingLeft: 0 }}>
        {websiteStatuses.map((d) => (
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
    </div>
  );
};

const LiveContent: StageContent = () => {
  const pageUid = usePageUid();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [cfVariableDiffs, setCfVariableDiffs] = useState<CfVariableDiff[]>([]);
  const [deploys, setDeploys] = useState<WebsiteStatus[]>([]);
  const [launches, setLaunches] = useState<WebsiteStatus[]>([]);
  const [isWebsiteReady, setIsWebsiteReady] = useState(false);
  const timeoutRef = useRef(0);

  const getWebsite = useCallback(async () => {
    try {
      const r = await samePageApiGet<{
        deploys: WebsiteStatus[];
        launches: WebsiteStatus[];
        isWebsiteReady: boolean;
      }>(`website-status?graph=${window.roamAlphaAPI.graph.name}`);
      setDeploys(r.deploys);
      setLaunches(r.launches);
      setIsWebsiteReady(r.isWebsiteReady);

      if (r.isWebsiteReady) {
        const response = await samePageApiGet<{
          DomainName: string;
          CustomDomain: string;
        }>(`website-variables?graph=${window.roamAlphaAPI.graph.name}`);
        if (Object.keys(response).length === 0) {
          return;
        }

        const { DomainName, CustomDomain } = response;

        const diffs = [];
        const tree = getBasicTreeByParentUid(pageUid);

        const newDomain =
          tree.find((t) => toFlexRegex("domain").test(t.text))?.children?.[0]
            ?.text || "";
        if (newDomain !== DomainName) {
          diffs.push({
            field: "Domain",
            old: DomainName,
            value: newDomain,
            key: "DomainName",
          });
        }

        const newIsCustomDomain = `${newDomain.endsWith(hostedDomain)}`;
        if (newIsCustomDomain !== CustomDomain) {
          diffs.push({
            field: "Is Custom Domain",
            old: CustomDomain,
            value: newIsCustomDomain,
            key: "CustomDomain",
          });
        }

        setCfVariableDiffs(diffs);
      } else {
        timeoutRef.current = window.setTimeout(getWebsite, 5000);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pageUid]);
  const wrapPost = useCallback(
    async (path: string, getData: (uid: string) => Record<string, unknown>) => {
      setError("");
      setLoading(true);
      try {
        const data = await defer(getData)(pageUid);
        await samePageApiPost(path, data);
        setLoading(false);
        await getWebsite();
        return true;
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
        return false;
      }
    },
    [setError, setLoading, getWebsite, pageUid]
  );
  const deploy = useCallback(
    () => wrapPost("deploy-website", getDeployBody),
    [wrapPost]
  );
  const launchWebsite = useCallback(async () => {
    const success = await wrapPost("launch-website", getLaunchBody);
    if (success) await wrapPost("deploy-website", getDeployBody);
  }, [wrapPost, deploy]);
  const shutdownWebsite = useCallback(
    () =>
      wrapPost("shutdown-website", () => ({
        graph: window.roamAlphaAPI.graph.name,
      })),
    [wrapPost]
  );
  const updateSite = useCallback(
    () =>
      wrapPost("update-website", () => ({
        graph: window.roamAlphaAPI.graph.name,
        diffs: cfVariableDiffs,
      })),
    [wrapPost, cfVariableDiffs]
  );

  useEffect(() => () => clearTimeout(timeoutRef.current), [timeoutRef]);
  useEffect(() => {
    setLoading(true);
    getWebsite()
      .then(() => setInitialLoad(false))
      .catch((e) => setError(e.response?.data || e.message))
      .finally(() => setLoading(false));
  }, [setError, setLoading, setInitialLoad, getWebsite]);

  const settingsTree = useMemo(
    () => getBasicTreeByParentUid(pageUid),
    [pageUid]
  );
  const domain = useMemo(() => {
    const value = settingsTree.find((t) => toFlexRegex("domain").test(t.text))
      ?.children?.[0]?.text;
    if (!value) {
      const newDomain = `${window.roamAlphaAPI.util.generateUID()}${hostedDomain}`;
      setInputSetting({
        blockUid: pageUid,
        key: "domain",
        value: newDomain,
        index: 1,
      });
      return newDomain;
    }
    return value;
  }, [pageUid, settingsTree]);
  const indexPage = useMemo(() => {
    return getSettingValueFromTree({
      tree: settingsTree,
      key: "index",
      defaultValue: "Website Index",
    });
  }, [settingsTree]);

  if (initialLoad) {
    return (
      <p style={{ display: "flex", alignItems: "start" }}>
        <Spinner size={14} /> Loading...
      </p>
    );
  }

  if (!domain) {
    return (
      <>
        <p>
          You're missing a domain! Click the settings icon on the top right to
          get started.
        </p>
        <Button
          disabled
          intent={Intent.PRIMARY}
          className="mb-16"
          style={{ maxWidth: 240 }}
        >
          LAUNCH
        </Button>
      </>
    );
  }
  const buttonsDisabled = !isWebsiteReady || loading;

  if (!launches.length) {
    return (
      <>
        <p>
          You're ready to launch your new site! Click the button below to start.
        </p>
        <div className="flex gap-4">
          <Button
            disabled={loading || !!error}
            onClick={launchWebsite}
            intent={Intent.PRIMARY}
            className="mb-16"
            style={{ maxWidth: 240 }}
            loading={loading}
          >
            LAUNCH
          </Button>
          <ErrorIndicator error={error} />
        </div>
        <div>
          <h4>Summary</h4>
          <p>
            Your website will available at <b>{domain}</b>.
          </p>
          <p>
            Your home page will be generated from <b>{indexPage}</b>.
          </p>
          <hr />
          <p>
            Click the settings icon on the top right to edit these settings.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center" }}>
        {!!cfVariableDiffs.length && (
          <Tooltip
            content={`Changes included: ${cfVariableDiffs
              .map(
                (diff) => `${diff.field} (from ${diff.old} to ${diff.value})`
              )
              .join(", ")}`}
          >
            <WebsiteButton
              onConfirm={updateSite}
              disabled={buttonsDisabled}
              buttonText={"Update Site"}
              intent={Intent.WARNING}
              loading={loading}
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
                Are you sure you want to make these changes? This operation
                could take several minutes.
              </p>
            </WebsiteButton>
          </Tooltip>
        )}
        <Button
          style={{ marginRight: 32, minWidth: 92 }}
          disabled={buttonsDisabled}
          onClick={deploy}
          intent={Intent.PRIMARY}
          loading={loading}
        >
          Deploy
        </Button>
        <WebsiteButton
          disabled={buttonsDisabled}
          onConfirm={shutdownWebsite}
          buttonText={"Shutdown"}
          intent={Intent.DANGER}
          loading={loading}
        >
          <p>
            Are you sure you want to shut down this RoamJS website? This
            operation is irreversible.
          </p>
        </WebsiteButton>
        <ErrorIndicator error={error} />
      </div>
      <hr style={{ margin: "16px 0" }} />
      <div className="flex gap-8 items-start">
        <WebsiteStatusesView title="Launches" websiteStatuses={launches} />
        <WebsiteStatusesView title="Deploys" websiteStatuses={deploys} />
      </div>
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
    tabs: [{ id: "type", options: ["uid", "lowercase"] }, { id: "delimiter" }],
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
        outerTabSelected?.tabs.map(({ id, ...rest }) => [id, rest]) || []
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
                        {outerTabSelected?.description}
                      </span>
                    </>
                  }
                />
                {outerTabSelected?.tabs.map(
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

type Theme = {
  name: string;
  description: string;
  thumbnail: string;
  value: string;
};

const ThemeBrowser = ({
  importTheme,
}: {
  importTheme: (s: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<number>();
  const [loading, setLoading] = useState(false);
  const openBrowser = useCallback(() => {
    setIsOpen(true);
    setLoading(true);
    samePageApiGet<{ themes: Theme[] }>(`themes`)
      .then((r) => setThemes(r.themes))
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
                importTheme(themes[selectedTheme || 0].value);
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
      (
        window.roamAlphaAPI.q(
          `[:find ?u ?contents :where [?p :block/uid ?u] [?p :block/string ?contents] [(clojure.string/includes? ?contents "https")]]`
        ) as [string, string][]
      ).map(([uid, text]) => ({ uid, text })),
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
                setValue={(val, urlUid = "") =>
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

type Redirect = { uuid: string; from: string; to: string; date: string };

const RequestRedirectsContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Redirect[]>([]);
  const onSubmit = useCallback(() => {
    setLoading(true);
    samePageApiPost("website-redirects", {
      method: "SUBMIT",
      redirects: values,
    })
      .then(nextStage)
      .catch(() => setLoading(false));
  }, [values, nextStage]);
  useEffect(() => {
    samePageApiPost<{ redirects: Redirect[] }>("website-redirects", {
      method: "GET",
    })
      .then((r) => setValues(r.redirects))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div>
      <div style={{ marginBottom: 32, minHeight: 320 }}>
        {loading ? (
          <Spinner size={32} />
        ) : (
          <>
            {values.map(({ from, to, uuid, date }) => (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
                key={uuid}
              >
                <Label>
                  From
                  <InputGroup
                    value={from}
                    onChange={(e) =>
                      setValues(
                        values.map((v) =>
                          v.uuid === uuid
                            ? {
                                uuid,
                                to,
                                from: e.target.value,
                                date,
                              }
                            : v
                        )
                      )
                    }
                  />
                </Label>
                <Label style={{ margin: "0 8px 15px", flexGrow: 1 }}>
                  To
                  <InputGroup
                    value={to}
                    onChange={(e) =>
                      setValues(
                        values.map((v) =>
                          v.uuid === uuid
                            ? {
                                uuid,
                                from,
                                to: e.target.value,
                                date,
                              }
                            : v
                        )
                      )
                    }
                  />
                </Label>
                <Button
                  icon={"trash"}
                  minimal
                  onClick={() => {
                    setLoading(true);
                    samePageApiPost("website-redirects", {
                      method: "DELETE",
                      uuid,
                      date,
                    })
                      .then(() =>
                        setValues(values.filter((v) => v.uuid !== uuid))
                      )
                      .finally(() => setLoading(false));
                  }}
                />
              </div>
            ))}
            <Button
              text={"Add Redirect"}
              intent={Intent.SUCCESS}
              onClick={() =>
                setValues([
                  ...values,
                  {
                    to: "",
                    from: "",
                    uuid: v4(),
                    date: new Date().toJSON(),
                  },
                ])
              }
            />
          </>
        )}
      </div>
      <ServiceNextButton onClick={onSubmit} />
    </div>
  );
};

type Sharing = { uuid: string; user: string; permission: string; date: string };

const RequestSharingContent: StageContent = ({ openPanel }) => {
  const nextStage = useServiceNextStage(openPanel);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Sharing[]>([]);
  const onSubmit = useCallback(() => {
    nextStage();
  }, [values, nextStage]);
  useEffect(() => {
    samePageApiPost<{ perms: Sharing[] }>("website-sharing", { method: "GET" })
      .then((r) => setValues(r.perms))
      .finally(() => setLoading(false));
  }, []);
  const userOptions = useMemo(
    () =>
      window.roamAlphaAPI.data.fast
        .q(`[:find ?e :where [?u :user/email ?e]]`)
        .map((p) => p[0] as string),
    []
  );
  const [newUser, setNewUser] = useState("");
  return (
    <div>
      <div style={{ marginBottom: 32, minHeight: 320 }}>
        {loading ? (
          <Spinner size={32} />
        ) : (
          <>
            {values.map(({ user, permission, uuid, date }) => (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
                key={uuid}
              >
                <Label style={{ margin: "0 8px 15px", flexGrow: 1 }}>
                  {user}
                </Label>
                <Label style={{ margin: "0 8px 15px" }}>
                  Permission
                  <MenuItemSelect
                    activeItem={permission}
                    onItemSelect={(e) => {
                      setLoading(true);
                      samePageApiPost("website-sharing", {
                        method: "UPDATE",
                        uuid,
                        date,
                        permission: e,
                      })
                        .then(() => {
                          setValues(
                            values.map((v) =>
                              v.uuid === uuid
                                ? {
                                    uuid,
                                    permission: e,
                                    user,
                                    date,
                                  }
                                : v
                            )
                          );
                        })
                        .finally(() => setLoading(false));
                    }}
                    items={["DEPLOY", "NONE"]}
                  />
                </Label>
                <Button
                  icon={"trash"}
                  minimal
                  onClick={() => {
                    setLoading(true);
                    samePageApiDelete("website-sharing", {
                      method: "DELETE",
                      uuid,
                    })
                      .then(() =>
                        setValues(values.filter((v) => v.uuid !== uuid))
                      )
                      .finally(() => setLoading(false));
                  }}
                />
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <AutocompleteInput
                value={newUser}
                setValue={setNewUser}
                placeholder="Enter email..."
                options={userOptions}
              />
              <Button
                text={"Share With New User"}
                intent={Intent.SUCCESS}
                onClick={() => {
                  setLoading(true);
                  samePageApiPost("website-sharing", {
                    method: "CREATE",
                    user: newUser,
                  })
                    .then((r) => {
                      setNewUser("");
                      setValues([...values, r as Sharing]);
                    })
                    .finally(() => setLoading(false));
                }}
              />
            </div>
          </>
        )}
      </div>
      <ServiceNextButton onClick={onSubmit} />
    </div>
  );
};

const StaticSiteDashboard = (): React.ReactElement => {
  return (
    <ServiceDashboard
      service={"static-site"}
      stages={[
        WrapServiceMainStage(LiveContent),
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
        { component: RequestRedirectsContent, setting: "Redirects" },
        { component: RequestSharingContent, setting: "Sharing" },
      ]}
    />
  );
};

export default StaticSiteDashboard;
