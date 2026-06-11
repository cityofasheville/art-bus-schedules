# ART Transit Site — Main template

---

## The Layout Shell (`layout.pug`)

The shared layout wraps every page. `block content` is the only thing that changes between pages.

```pug
doctype html
html(lang='en')
  head
    title= config.webpageTitle + ' - ' + pageTitle
    link(rel='stylesheet' href='/css/global.css')

  body
    header
      include navigation.pug

    main(id='main_content')
      block content

    footer
      include footer.pug
```
