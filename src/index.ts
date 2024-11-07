import {
  Supernova,
  PulsarContext,
  RemoteVersionIdentifier,
  AnyOutputFile,
} from "@supernovaio/sdk-exporters";
import { styleOutputFile } from "./style-file";

/**
 * Export entrypoint.
 * When running `export` through extensions or pipelines, this function will be called.
 * Context contains information about the design system and version that is currently being exported.
 */
Pulsar.export(
  async (
    sdk: Supernova,
    context: PulsarContext
  ): Promise<Array<AnyOutputFile>> => {
    // Fetch data from design system that is currently being exported (context)
    const remoteVersionIdentifier: RemoteVersionIdentifier = {
      designSystemId: context.dsId,
      versionId: context.versionId,
    };

    // Fetch the necessary data
    let tokens = await sdk.tokens.getTokens(remoteVersionIdentifier);
    let darkTokens;
    let tokenGroups = await sdk.tokens.getTokenGroups(remoteVersionIdentifier);

    // Filter by brand, if specified
    if (context.brandId) {
      const brands = await sdk.brands.getBrands(remoteVersionIdentifier);
      const brand = brands.find(
        (brand) =>
          brand.id === context.brandId || brand.idInVersion === context.brandId
      );
      if (!brand) {
        throw new Error(`Unable to find brand ${context.brandId}.`);
      }

      tokens = tokens.filter((token) => token.brandId === brand.id);
      tokenGroups = tokenGroups.filter(
        (tokenGroup) => tokenGroup.brandId === brand.id
      );
    }

    // The light theme is the default theme
    const lightTokens = tokens;

    // Get the dark theme
    const themes = await sdk.tokens.getTokenThemes(remoteVersionIdentifier);
    const theme = themes.find((theme) => theme.name === "Dark");
    if (theme) {
      darkTokens = theme.overriddenTokens;
    } else {
      // Don't allow applying theme which doesn't exist in the system
      throw new Error(
        "Unable to apply theme which doesn't exist in the system."
      );
    }

    // Find the root group
    const rootGroup = tokenGroups.find((g) => !g.parentGroupId);
    if (!rootGroup) {
      throw new Error("Unable to find root group.");
    }

    // Style the output file
    const result = styleOutputFile(
      tokenGroups,
      rootGroup,
      lightTokens,
      darkTokens
    );

    // Generate output files
    return [result as AnyOutputFile];
  }
);
