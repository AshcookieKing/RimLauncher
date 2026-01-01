import { createRoot } from 'react-dom/client';
import RpRulesView from './components/RpRulesView';
import './styles/app.css';

createRoot(document.getElementById('root')).render(<RpRulesView standalone onBack={() => window.close()} />);
