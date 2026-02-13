precision mediump float;

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNoise;

uniform float time;
uniform float fBeat1;
uniform float fBeat2;
uniform float fBeat3;

varying vec4 vPosition;
varying vec2 vTexture;

vec4 blur3x3(sampler2D image, vec2 uv, float w, float h) {
  vec3 c = vec3(0.0);
  c += texture2D(image, uv + vec2(-w, -h)).rgb;
  c += texture2D(image, uv + vec2( 0, -h)).rgb;
  c += texture2D(image, uv + vec2( w, -h)).rgb;
  c += texture2D(image, uv + vec2(-w,  0)).rgb;
  c += texture2D(image, uv).rgb;
  c += texture2D(image, uv + vec2( w,  0)).rgb;
  c += texture2D(image, uv + vec2(-w,  h)).rgb;
  c += texture2D(image, uv + vec2( 0,  h)).rgb;
  c += texture2D(image, uv + vec2( w,  h)).rgb;
  return vec4(c / 9.0, 1.0);
}

void main(void) {
    vec2 p = vTexture.xy;

    vec4 col = texture2D(tColor, p);
    vec4 blurred = blur3x3(tColor, p, 0.003, 0.003);

    float fb = fBeat3 * fBeat2 + 0.3 * sin(time / 3791.0);
    float ifb = 1.0 - fb;

    vec4 o = col * ifb + blurred * fb;
    o += blurred * (0.04 + fBeat3 * 0.1);

    vec2 pc = p - vec2(0.5, 0.5);
    pc *= pc;
    float l = length(pc);
    o *= vec4(1.0, 1.0, 1.0, 1.0) * (1.0 - l * 3.0);

    gl_FragColor = o;
}
