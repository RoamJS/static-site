import React from "react";
import ReactDOM from "react-dom";
import ReactDOMServer from "react-dom/server";
import { ensureReact, ensureScript } from "../lambdas/common/components";
import { RenderFunction } from "../lambdas/common/types";
import { Icon } from "@blueprintjs/core";
import {
  FaTwitter,
  FaGithub,
  FaLinkedin,
  FaInstagram,
  FaFacebook,
  FaReddit,
  FaYoutube,
  FaMedium,
  FaTwitch,
  FaStrava,
} from "react-icons/fa";

type Props = {
  links: string[];
  copyright: string;
};

const icons = [
  { test: /twitter\.com/, component: <Icon icon={<FaTwitter />} /> },
  { test: /github\.com/, component: <Icon icon={<FaGithub />} /> },
  { test: /linkedin\.com/, component: <Icon icon={<FaLinkedin />} /> },
  { test: /instagram\.com/, component: <Icon icon={<FaInstagram />} /> },
  { test: /facebook\.com/, component: <Icon icon={<FaFacebook />} /> },
  { test: /reddit\.com/, component: <Icon icon={<FaReddit />} /> },
  { test: /youtube\.com/, component: <Icon icon={<FaYoutube />} /> },
  { test: /medium\.com/, component: <Icon icon={<FaMedium />} /> },
  { test: /twitch\.tv/, component: <Icon icon={<FaTwitch />} /> },
  { test: /strava\.com/, component: <Icon icon={<FaStrava />} /> },
  { test: /^mailto:/, component: <Icon icon={"envelope"} /> },
  { test: /.*/, component: <Icon icon={"social-media"} /> },
];

const Footer = ({ links, copyright }: Props): React.ReactElement => {
  return (
    <>
      <style>
        {`.roamjs-footer {
  padding: 8px;
  flex-shrink: 0;
}

.roamjs-footer-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.roamjs-footer-social-networks {
  margin: 0 -8px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0;
  list-style: none;
}

.roamjs-footer-social-networks li {
  padding: 0 8px;
}`}
      </style>
      <footer className={"roamjs-footer"}>
        <div className={"roamjs-footer-container"}>
          <span>
            © {new Date().getFullYear()} {copyright}
          </span>
          <span>
            Built with
            {` `}
            <a
              href="https://roamjs.com/services/static-site"
              target="_blank"
              rel="noopener"
            >
              RoamJS
            </a>
          </span>
          <ul className={"roamjs-footer-social-networks"}>
            {links.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noopener">
                  {icons.find((i) => i.test.test(link)).component}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </>
  );
};

export const ID = "roamjs-footer";

if (process.env.CLIENT_SIDE) {
  ReactDOM.hydrate(
    <Footer {...(window.roamjsProps.footer as Props)} />,
    document.getElementById(ID)
  );
}

let cache = "";

export const render: RenderFunction = (dom, props) => {
  const componentProps = {
    links: props["links"] || [],
    copyright: props["copyright"][0] || "",
  };
  const innerHtml =
    cache ||
    (cache = ReactDOMServer.renderToString(<Footer {...componentProps} />));
  const { document } = dom.window;
  const { body, head } = document;
  const container = document.createElement("div");
  container.id = ID;
  body.appendChild(container);
  container.innerHTML = innerHtml;
  ensureReact(document);
  ensureScript("footer", componentProps, document, head);
};

export default Footer;
