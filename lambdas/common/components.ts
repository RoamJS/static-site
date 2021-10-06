export const ensureReact = (document: Document, head = document.head): void => {
  if (!document.getElementById("roamjs-react")) {
    const react = document.createElement("script");
    react.id = "roamjs-react";
    react.src = "https://unpkg.com/react@17/umd/react.production.min.js";
    const reactdom = document.createElement("script");
    reactdom.id = "roamjs-react-dom";
    reactdom.src =
      "https://unpkg.com/react-dom@17/umd/react-dom.production.min.js";
    head.appendChild(react);
    head.appendChild(reactdom);
  }
};

export const ensureBlueprint = (
  document: Document,
  head = document.head
): void => {
  if (!document.getElementById("roamjs-blueprint")) {
    const bp = document.createElement("link");
    bp.id = "roamjs-blueprint";
    bp.href =
      "https://unpkg.com/@blueprintjs/core@^3.10.0/lib/css/blueprint.css";
    const normalize = document.createElement("link");
    normalize.id = "roamjs-blueprint-normalize";
    normalize.href = "https://unpkg.com/normalize.css@^7.0.0";
    bp.rel = normalize.rel = "stylesheet";
    head.appendChild(normalize);
    head.appendChild(bp);
  }
};

export const ensureScript = (
  id: string,
  componentProps: Record<string, unknown>,
  document: Document,
  head = document.head
): void => {
  const propScript = document.createElement("script");
  propScript.innerHTML = `window.roamjsProps = {
      ...window.roamjsProps,
      "${id}": ${JSON.stringify(componentProps)}
    }`;
  propScript.type = "text/javascript";
  head.appendChild(propScript);
  const componentScript = document.createElement("script");
  componentScript.src = `${process.env.COMPONENTS_URL}/${id}.js`;
  componentScript.defer = true;
  head.appendChild(componentScript);
};
