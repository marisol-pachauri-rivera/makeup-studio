# Spec Delta

## Purpose

Garantizar que ante un error inesperado o una ruta inexistente la clienta vea una página propia, comprensible y con una salida clara, sin información técnica del sistema.

## ADDED Requirements

### Requirement: Página de error ante fallos inesperados
Cuando una página del sitio falla por un error no controlado, el sistema SHALL mostrar una página de error propia, en español, con un mensaje comprensible y una acción para reintentar. MUST NOT mostrar el mensaje técnico, la traza ni nombres internos.

#### Scenario: Error durante el render de una ruta
- **WHEN** una ruta lanza un error no controlado al renderizarse
- **THEN** la clienta ve la página de error amigable con la opción de reintentar
- **AND** el contenido mostrado no incluye el texto del error original ni la traza

#### Scenario: Reintentar desde la página de error
- **WHEN** la clienta usa la acción de reintentar y la causa del error ya no existe
- **THEN** la ruta se renderiza normalmente

### Requirement: Página de error global
Cuando falla la estructura raíz de la aplicación, el sistema SHALL mostrar igualmente una página de error propia y autocontenida, con el mismo mensaje amigable.

#### Scenario: Falla en el layout raíz
- **WHEN** ocurre un error no controlado en el layout raíz
- **THEN** la clienta ve la página de error global amigable y no la pantalla por defecto del framework

### Requirement: Página de ruta no encontrada
Cuando la clienta visita una ruta que no existe, el sistema SHALL mostrar una página propia que indique que no se encontró la página y ofrezca un enlace al inicio del sitio. La respuesta MUST usar el código HTTP 404.

#### Scenario: Ruta inexistente
- **WHEN** la clienta abre una URL que no corresponde a ninguna ruta
- **THEN** recibe una respuesta 404 con la página propia y un enlace al inicio

### Requirement: Páginas de error legibles en móvil
Las páginas de error SHALL ser legibles y utilizables en pantallas de celular y SHALL usar el mismo estilo visual del sitio.

#### Scenario: Visualización en pantalla angosta
- **WHEN** una página de error se abre en un ancho de 360 px
- **THEN** el mensaje y la acción principal son visibles sin desplazamiento horizontal
