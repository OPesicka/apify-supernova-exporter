import { FileHelper } from "@supernovaio/export-helpers"
import { ColorToken, ColorTokenValue, OutputTextFile, Token, TokenGroup, TokenType } from "@supernovaio/sdk-exporters"
import { exportConfiguration } from ".."
import { convertedToken } from "../content/token"

export function styleOutputFile(type: TokenType, tokens: Array<Token>, tokenGroups: Array<TokenGroup>, rootGroup, lightTokens, darkTokens): OutputTextFile | null {
  // Filter tokens by top level type
  const tokensOfType = tokens.filter((token) => token.tokenType === type)

  // Filter out files where there are no tokens, if enabled
  if (!exportConfiguration.generateEmptyFiles && tokensOfType.length === 0) {
    return null
  }

  // Convert all tokens to CSS variables
  // const mappedTokens = new Map(tokens.map((token) => [token.id, token]))
  // const cssVariables = tokensOfType.map((token) => convertedToken(token, mappedTokens, tokenGroups)).join("\n")


  // Create file content
  // let content = `:root {\n${cssVariables}\n}`;
  // if (exportConfiguration.showGeneratedFileDisclaimer) {
  //   // Add disclaimer to every file if enabled
  //   content = `/* ${exportConfiguration.disclaimer} */\n${content}`
  // }

  const lightPaletteConent = representTree(
    rootGroup,
    lightTokens,
    tokenGroups,
    {}
  );

  const darkPaletteConent = representTree(
    rootGroup,
    darkTokens,
    tokenGroups,
    {}
  );

  // Retrieve content as file which content will be directly written to the output
  return FileHelper.createTextFile({
    relativePath: exportConfiguration.baseStyleFilePath,
    fileName: `colors.json`,
    content: JSON.stringify({
      light: lightPaletteConent,
      dark: darkPaletteConent,
    }, null, 2),
  })
}



function representTree(
  rootGroup: TokenGroup,
  allTokens: Array<Token>,
  allGroups: Array<TokenGroup>,
  writeObject: Object
): Object {
  // Represent one level of groups and tokens inside tree. Creates subobjects and then also information about each token
  for (let group of rootGroup.subgroupIds.map((id) => allGroups.find((g) => g.id === id))) {
    if (!group) {
      continue;
    }
    // Write buffer
    let writeSubObject = {};

    // Add each entry for each subgroup, and represent its tree into it
    writeObject[group.name] = representTree(
      group,
      allTokens,
      allGroups,
      writeSubObject
    );

    // Add each entry for each token, writing to the same write root
    for (let token of tokensOfGroup(group, allTokens)) {
        writeSubObject[token.name] = representColorToken(token as ColorToken, allTokens, allGroups);
    }
  }

  return writeObject;
}


function tokensOfGroup(
  containingGroup: TokenGroup,
  allTokens: Array<Token>
): Array<Token> {
  const isVirtualShadow = (t: Token) =>
    (t as any)?.isVirtual === true && t.tokenType === "Shadow";
  return allTokens.filter(
    (t) => containingGroup.tokenIds.indexOf(t.id) !== -1 && !isVirtualShadow(t)
  );
}

function representColorToken(
  token: ColorToken,
  allTokens: Array<Token>,
  allGroups: Array<TokenGroup>
): Object {
  let value = representColorTokenValue(token.value, allTokens, allGroups);
  return tokenWrapper(token, value);
}


// Taken from rgb-hex package
export default function rgbHex(red, green, blue, alpha?) {
  let isPercent = (red + (alpha || "")).toString().includes("%");

  if (typeof red === "string" && !green) {
    // Single string parameter.
    const parsed = parseCssRgbString(red);
    if (!parsed) {
      throw new TypeError("Invalid or unsupported color format.");
    }

    isPercent = false;
    [red, green, blue, alpha] = parsed;
  } else if (alpha !== undefined) {
    alpha = Number.parseFloat(alpha);
  }

  if (
    typeof red !== "number" ||
    typeof green !== "number" ||
    typeof blue !== "number" ||
    red > 255 ||
    green > 255 ||
    blue > 255
  ) {
    throw new TypeError("Expected three numbers below 256");
  }

  if (typeof alpha === "number") {
    if (!isPercent && alpha >= 0 && alpha <= 1) {
      alpha = Math.round(255 * alpha);
    } else if (isPercent && alpha >= 0 && alpha <= 100) {
      alpha = Math.round((255 * alpha) / 100);
    } else {
      throw new TypeError(
        `Expected alpha value (${alpha}) as a fraction or percentage`
      );
    }

    alpha = (alpha | (1 << 8)).toString(16).slice(1); // eslint-disable-line no-mixed-operators
  } else {
    alpha = "";
  }

  return toHex(red, green, blue, alpha);
}

const parseCssRgbString = (input) => {
  const parts = input
    .replace(/rgba?\(([^)]+)\)/, "$1")
    .split(/[,\s/]+/)
    .filter(Boolean);
  if (parts.length < 3) {
    return;
  }

  const parseValue = (value, max) => {
    value = value.trim();

    if (value.endsWith("%")) {
      return Math.min((Number.parseFloat(value) * max) / 100, max);
    }

    return Math.min(Number.parseFloat(value), max);
  };

  const red = parseValue(parts[0], 255);
  const green = parseValue(parts[1], 255);
  const blue = parseValue(parts[2], 255);
  let alpha;

  if (parts.length === 4) {
    alpha = parseValue(parts[3], 1);
  }

  return [red, green, blue, alpha];
};

const toHex = (red, green, blue, alpha) =>
  (blue | (green << 8) | (red << 16) | (1 << 24)).toString(16).slice(1) + alpha;

// end of rgb-hex package

function representColorTokenValue(
  value: ColorTokenValue,
  allTokens: Array<Token>,
  allGroups: Array<TokenGroup>
): any {
  let result: any;
  if (value.referencedTokenId) {
    // Forms reference
    result = referenceWrapper(referenceName(value.referencedTokenId, allGroups, allTokens));
  } else {
    // Raw value
    const hex = rgbHex(value.color.r, value.color.g, value.color.b);
    result = `#${hex}`;
  }
  return result;
}

function tokenWrapper(token: Token, value: any) {
  return {
    value: value,
    type: typeLabel(token.tokenType),
    comment: token.description.length > 0 ? token.description : undefined,
  };
}

function typeLabel(type: TokenType) {
  switch (type) {
    case "Border":
      return "border";
    case "Color":
      return "color";
    case "Typography":
      return "typography";
  }
}

function referenceWrapper(reference: string) {
  return `{${reference}}`;
}

function referenceName(tokenId: string, allGroups: Array<TokenGroup>, allTokens: Array<Token>) {
  // Find the group to which token belongs. This is really suboptimal and should be solved by the SDK to just provide the group reference
  const token = allTokens.find((t) => t.id === tokenId);
  if (!token) {
    throw Error("JS: Unable to find token");
  }
  let occurances = allGroups.filter((g) => g.tokenIds.indexOf(token.id) !== -1);
  if (occurances.length === 0) {
    throw Error("JS: Unable to find token in any of the groups");
  }
  let containingGroup = occurances[0];
  let tokenPart = token;
  let groupParts = referenceGroupChain(containingGroup, allGroups).map((g) => g.name).join(".");
  return [groupParts, tokenPart.name].join(".");
}

//TODO: remove first group from the chain if it is called Color
function referenceGroupChain(
  containingGroup: TokenGroup,
  allGroups: Array<TokenGroup>
): Array<TokenGroup> {
  let iteratedGroup = containingGroup;
  let chain = [containingGroup];
  while (iteratedGroup.parentGroupId) {
    const parrentGroup = allGroups.find(
      (g) => g.id === iteratedGroup.parentGroupId
    );
    if (!parrentGroup) {
      throw Error("JS: Unable to find parent group");
    }
    chain.push(parrentGroup);
    iteratedGroup = parrentGroup;
  }

  const result = chain.reverse();
  const resultWithoutColor = result.filter((g) => g.name !== "Color");
  return resultWithoutColor;
}
