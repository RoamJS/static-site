export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
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
