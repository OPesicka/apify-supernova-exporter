import { FileHelper } from "@supernovaio/export-helpers";
import {
  ColorToken,
  ColorTokenValue,
  OutputTextFile,
  Token,
  TokenGroup,
  TokenType,
} from "@supernovaio/sdk-exporters";
import rgbHex from "rgb-hex";

export function styleOutputFile(
  tokenGroups: Array<TokenGroup>,
  rootGroup: TokenGroup,
  lightTokens: Array<Token>,
  darkTokens: Array<Token>
): OutputTextFile | null {
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
    relativePath: "tokens",
    fileName: `colors.json`,
    content: JSON.stringify(
      {
        light: lightPaletteConent,
        dark: darkPaletteConent,
      },
      null,
      2
    ),
  });
}

function representTree(
  rootGroup: TokenGroup,
  allTokens: Array<Token>,
  allGroups: Array<TokenGroup>,
  writeObject: Object
): Object {
  // Represent one level of groups and tokens inside tree. Creates subobjects and then also information about each token
  for (let group of rootGroup.subgroupIds.map((id) =>
    allGroups.find((g) => g.id === id)
  )) {
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
      writeSubObject[token.name] = representColorToken(
        token as ColorToken,
        allTokens,
        allGroups
      );
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

function representColorTokenValue(
  value: ColorTokenValue,
  allTokens: Array<Token>,
  allGroups: Array<TokenGroup>
): any {
  let result: any;
  if (value.referencedTokenId) {
    // Forms reference
    result = referenceWrapper(
      referenceName(value.referencedTokenId, allGroups, allTokens)
    );
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
    case "Color":
      return "color";
  }
}

function referenceWrapper(reference: string) {
  return `{${reference}}`;
}

function referenceName(
  tokenId: string,
  allGroups: Array<TokenGroup>,
  allTokens: Array<Token>
) {
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
  let groupParts = referenceGroupChain(containingGroup, allGroups)
    .map((g) => g.name)
    .join(".");
  return [groupParts, tokenPart.name].join(".");
}

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
  // To match our syntax we need to remove the "Color" group
  const resultWithoutColor = result.filter((g) => g.name !== "Color");
  return resultWithoutColor;
}
