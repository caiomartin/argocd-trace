import * as React from 'react';
import {Trace} from './Trace';
import tokensCss from './styles/tokens.css?inline';
import traceCss from './styles/trace.css?inline';

const STYLE_ID = 'argocd-trace-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${tokensCss}
${traceCss}`;
  document.head.appendChild(style);
}

window.extensionsAPI?.registerResourceExtension(
  Trace,
  'argoproj.io',
  'Application',
  'Trace',
  {icon: 'fa-code-branch'}
);

export default Trace;
