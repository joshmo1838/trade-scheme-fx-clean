import type {Metadata} from 'next';
import StrategyLibrary from './StrategyLibrary';

export const metadata:Metadata={
  title:'100 Strategy Research Library | Trade Scheme FX',
  description:'Browse 100 unvalidated strategy hypotheses for research and chronological paper evaluation.',
};

export default function StrategyLibraryPage(){return <StrategyLibrary/>;}
