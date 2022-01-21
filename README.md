# RoamJS Static Site

For more about the RoamJS Static Site Service, visit [https://roamjs.com/services/static-site](https://roamjs.com/services/static-site).

# Github Action

A GitHub action for generating a static site from your Roam Graph is also available. You could use this for free to upload the generated files to your own hosting service. It uses the same underlying logic as the Static Site extension itself, querying the data by running a headless browser and logging into your account.

## Inputs

### `roam_username`

**Required** Your Roam username

### `roam_password`

**Required** Your Roam password

### `roam_graph`

**Required** Your Roam Graph

### `config_path`

**Required** The path to the json file use to override and Roam config settings, relative to `GITHUB_WORKSPACE`. Default value is `static_site.json`.

## Usage

```yaml
uses: dvargas92495/roamjs-static-site@2022-01-21-01-15
with:
    roam_username: dvargas92495@gmail.com
    roam_password: ${{ secrets.ROAM_PASSWORD }}
    roam_graph: dvargas92495
```

I have an [example repository](https://github.com/dvargas92495/public-garden) showcasing this action. The resulting site is reachable at https://garden.davidvargas.me.
