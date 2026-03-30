import { proxyRequest, type ProxyEnvironment } from "./proxy-handler";

type WorkerEnvironment = ProxyEnvironment;

const worker = {
	fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
		return proxyRequest(request, env);
	},
};

export default worker;
