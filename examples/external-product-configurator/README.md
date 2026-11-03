# External Product Configurator Source Fixture

The shared Product Studio module and headphones manifest remain available to
browser contracts and the public Product Configurator workflow. Its duplicate
public entry point was removed for Aura3D 4.0; `examples/product-configurator`
is the single public product studio owner.

The fixture page accepts `?material=asset|contrast|metal-check` and
`?lighting=catalog-softbox|hero-contrast|inspection-bay` to open on that
select option; without them it starts on Asset / Catalog softbox as before.
