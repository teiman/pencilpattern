// Punto de entrada del Web Worker: expone el motor a la UI vía Comlink.
import * as Comlink from 'comlink';
import { Engine } from './engine';

Comlink.expose(new Engine());
